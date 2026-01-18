import {
  children,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  Suspense,
  useContext,
} from "solid-js";
import { History } from "~/components/History";
import { PlanTable } from "~/components/PlanTable";
import { RepaymentType } from "~/consts";
import { LoanData } from "~/types/LoanData";
import { isString, pick, thru } from "lodash-es";
import { Summary } from "~/components/Summary";
import { Modal } from "~/components/Modal";
import { AppContext } from "~/stores";
import { createAsync, useNavigate, useSearchParams } from "@solidjs/router";
import dayjs from "dayjs";
import { NeedLoggedIn } from "~/stores/user";
import { Input } from "~/components/Input";

function calculateRepaymentPlan(
  principal: number,
  periods: number,
  rate: number,
  repaymentType: string,
): LoanData | null {
  if (!principal || !periods || !rate || periods <= 0) return null;

  const monthlyRate = rate / 100 / 12;
  const plan = [];

  if (repaymentType === RepaymentType.EQUAL_PRINCIPAL_INTEREST) {
    const theoreticalPayment =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, periods)) /
      (Math.pow(1 + monthlyRate, periods) - 1);
    let monthlyPayment = Math.round(theoreticalPayment);

    let remaining = principal;
    for (let i = 1; i <= periods; i++) {
      const interest = remaining * monthlyRate;
      let principalPart = monthlyPayment - interest;

      if (i === periods) {
        principalPart = remaining;
        const finalPayment = Math.round(principalPart + interest);
        plan.push({
          period: i,
          payment: finalPayment,
          principal: parseFloat(principalPart.toFixed(2)),
          interest: parseFloat((finalPayment - principalPart).toFixed(2)),
          remaining: 0,
        });
        break;
      }

      remaining -= principalPart;
      if (remaining < 0) {
        // 提前还清处理（简化）
        plan[plan.length - 1].principal += remaining;
        plan[plan.length - 1].remaining = 0;
        plan[plan.length - 1].payment = Math.round(
          plan[plan.length - 1].principal + plan[plan.length - 1].interest,
        );
        break;
      }

      plan.push({
        period: i,
        payment: monthlyPayment,
        principal: parseFloat(principalPart.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        remaining: parseFloat(remaining.toFixed(2)),
      });
    }
  } else {
    const basePrincipal = principal / periods;
    let totalAllocated = 0;

    for (let i = 1; i <= periods; i++) {
      let principalPart =
        i === periods ? principal - totalAllocated : basePrincipal;
      principalPart = parseFloat(principalPart.toFixed(2));
      totalAllocated += principalPart;

      const remainingBefore = principal - (totalAllocated - principalPart);
      const interest = remainingBefore * monthlyRate;
      const rawPayment = principalPart + interest;
      const roundedPayment = Math.round(rawPayment);
      const adjustedInterest = roundedPayment - principalPart;

      plan.push({
        period: i,
        payment: roundedPayment,
        principal: principalPart,
        interest: parseFloat(adjustedInterest.toFixed(2)),
        remaining: parseFloat(
          Math.max(0, remainingBefore - principalPart).toFixed(2),
        ),
      });
    }

    const last = plan[periods - 1];
    if (last.remaining > 0.01) {
      last.principal += last.remaining;
      last.remaining = 0;
      last.payment = Math.round(last.principal + last.interest);
      last.interest = last.payment - last.principal;
    }
  }

  // 确保所有 payment 是整数
  for (const item of plan) {
    if (!Number.isInteger(item.payment)) {
      item.payment = Math.round(item.payment);
    }
  }

  return {
    principal,
    periods,
    annualRate: rate,
    repaymentType,
    plan,
    currentPeriod: 0,
    paymentHistory: [],
    lastModifiedAt: 0,
    lastSyncedAt: 0,
  };
}

function SyncStatus(props: { loanData?: LoanData; loading?: boolean }) {
  const lastModified = () => props.loanData?.lastModifiedAt || 0;
  const lastSynced = () => props.loanData?.lastSyncedAt || 0;
  return (
    <Show
      when={props.loanData && !props.loading}
      fallback={
        <span class="text-gray-500">
          <Show
            when={props.loading}
            fallback={
              <>
                <div class="status mr-1"></div>无数据
              </>
            }
          >
            <span class="loading loading-spinner mr-2"></span>等待同步...
          </Show>
        </span>
      }
    >
      <Show
        when={lastModified() <= lastSynced()}
        fallback={<span class="text-amber-600">🔄 有本地改动，等待同步…</span>}
      >
        <span class="text-green-600">✅ 已同步（云端最新）</span>;
      </Show>
    </Show>
  );
}

function Home() {
  const { userStore, toastStore, oneDriveClient } = useContext(AppContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = createSignal(false);
  const [loanData, setLoanData] = createSignal<LoanData>();
  const [editing, setEditing] = createSignal<boolean>();
  const [prevLoanData, setPrevLoanData] = createSignal<LoanData>();
  const [getPrincipal, setPrincipal] = createSignal<string>("10000");
  const [getPeriods, setPeriods] = createSignal<string>("12");
  const [getRate, setRate] = createSignal<string>("5.5");
  const [autoSync, setAutoSync] = createSignal<boolean>(true);
  const navigate = useNavigate();
  const [editFileName, setEditFileName] = createSignal<string>("");
  const [getRepaymentType, setRepaymentType] = createSignal<string>(
    RepaymentType.EQUAL_PRINCIPAL_INTEREST,
  );
  const isLoggedIn = () => !!userStore.state.accessToken;
  const isCreate = () =>
    !(
      isString(searchParams.file_id) &&
      searchParams.file_id &&
      isString(searchParams.folder_id) &&
      searchParams.folder_id
    );
  const folderId = () => searchParams.folder_id?.toString() ?? "";
  const fileId = () => searchParams.file_id?.toString() ?? "";
  const prevFileId = createMemo(() => loanData()?.prev_file_id);
  const prevFileMeta = createAsync(async () => {
    const id = prevFileId();
    return id
      ? oneDriveClient.fetchFileMeta({ file_id: id }).then((res) => {
          return res.ok
            ? res.json().then((json) => pick(json, "id", "name"))
            : undefined;
        })
      : undefined;
  });
  const [modal, setModal] = createSignal({
    visible: false,
    title: "",
    loading: false,
    onOk: () => {},
  });
  const fileName = createMemo(() => {
    isCreate() || editing();
    return `loan_calculator_data_${dayjs().format("YYYYMMDDHHmmss")}.json`;
  });

  let timerId: number | undefined;

  const showMessage = (text: string, isError = false) => {
    toastStore.showMessage({ text, type: isError ? "error" : "info" });
  };

  const downloadFromOnedrive = async () => {
    try {
      const metaRes = await oneDriveClient.fetchFileMeta({
        file_id: fileId(),
      });
      if (!metaRes) return null;

      if (metaRes.status === 404) {
        showMessage("云端无数据", true);
        return null;
      }
      if (!metaRes.ok) {
        showMessage("❌ 下载失败", true);
        throw new Error("download failed");
      }

      const meta = await metaRes.json();
      const contentRes = await fetch(meta["@microsoft.graph.downloadUrl"]);
      const text = await contentRes.text();
      const data = JSON.parse(text);
      return data;
    } catch (err) {
      console.error("下载错误:", err);
      showMessage("❌ 下载异常", true);
      throw err;
    }
  };

  let autoSyncTimer: number | undefined;

  const updateUI = () => {
    const data = loanData();

    // 自动同步（防抖）
    if (isLoggedIn() && !isCreate() && !editing() && data && autoSync()) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = window.setTimeout(() => {
        uploadToOnedrive(data, { file_id: fileId() });
      }, 3000);
    }
  };

  // ======================
  // 操作函数
  // ======================
  const makePayment = () => {
    const data = loanData();
    if (!data || data.currentPeriod >= data.plan.length) return;
    const current = data.plan[data.currentPeriod];
    setLoanData({
      ...data,
      paymentHistory: [
        ...data.paymentHistory,
        { ...current, date: new Date().toISOString() },
      ],
      currentPeriod: data.currentPeriod + 1,
      lastModifiedAt: Date.now(),
    });
    updateUI(); // 内部会调用 updateSyncStatus()
  };

  const undoPayment = () => {
    const data = loanData();
    if (!data || data.paymentHistory.length === 0) return;
    setLoanData({
      ...data,
      paymentHistory: data.paymentHistory.slice(0, -1),
      currentPeriod: data.paymentHistory.length - 1,
      lastModifiedAt: Date.now(),
    });
    updateUI(); // 内部会调用 updateSyncStatus()
  };

  function syncFormFromData(data?: LoanData) {
    if (!data) return;
    setPrincipal(data.principal.toString());
    setPeriods(data.periods.toString());
    setRate(data.annualRate.toString());
    setRepaymentType(
      data.repaymentType || RepaymentType.EQUAL_PRINCIPAL_INTEREST,
    );
  }

  const uploadToOnedrive = async (
    data: LoanData,
    options?: { file_id?: string; file_name?: string },
  ) => {
    try {
      const now = Date.now(); // ←←← 关键：标记已同步
      const res = await oneDriveClient.putFile({
        content: {
          prev_file_id: options?.file_name ? fileId() : undefined,
          ...data,
          lastSyncedAt: now,
        },
        file_id: options?.file_id,
        folder_id: folderId(),
        file_name: options?.file_name,
      });
      if (res && res.ok) {
        setLoanData((prev) => {
          if (!prev || prev.lastSyncedAt >= now) {
            return prev;
          }
          return {
            ...prev,
            lastSyncedAt: now,
          };
        });
        return res.json();
      } else {
        showMessage("❌ 上传失败", true);
        throw new Error("上传失败");
      }
    } catch (err) {
      showMessage("❌ 上传异常", true);
      throw new Error("上传异常");
    }
  };

  createEffect(async () => {
    if (!isCreate() && fileId()) {
      if (isLoggedIn()) {
        // 优先从云端加载
        setLoading(true);
        try {
          const cloudData = await downloadFromOnedrive();
          if (cloudData) {
            setLoanData(cloudData);
            syncFormFromData(cloudData);
            updateUI();
          }
        } catch (e) {
          showMessage((e as Error).message, true);
        }
        setLoading(false);
      }
    }
  });

  onCleanup(() => {
    clearTimeout(timerId);
    clearTimeout(autoSyncTimer);
  });

  return (
    <>
      <div class="navbar bg-base-100 shadow-sm sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          class="btn btn-ghost btn-sm mr-2"
          aria-label="返回"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <h1 class="text-xl font-bold text-gray-800 overflow-hidden text-ellipsis">
          {searchParams.file_name || "贷款复利计算器"}
        </h1>
        <Show when={!isCreate() && !editing()}>
          <button
            class="btn btn-ghost btn-square"
            onClick={() => {
              setEditFileName(fileName());
              setModal({
                visible: true,
                title: "修改文件名",
                loading: false,
                onOk: () => {
                  if (!editFileName()) {
                    return;
                  }
                  setModal((prev) => {
                    return {
                      ...prev,
                      loading: true,
                    };
                  });
                  oneDriveClient
                    .renameFile({
                      file_id: fileId(),
                      file_name: editFileName(),
                    })
                    .then(
                      (res) => {
                        setModal((prev) => {
                          return {
                            ...prev,
                            loading: false,
                            visible: false,
                          };
                        });
                        setSearchParams(
                          {
                            file_name: editFileName(),
                          },
                          { replace: true },
                        );
                      },
                      () => {
                        setModal((prev) => {
                          return {
                            ...prev,
                            loading: false,
                          };
                        });
                      },
                    );
                },
              });
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </Show>
      </div>
      <div class="container mx-auto pt-8">
        <div class="flex flex-col gap-y-4">
          <Show when={!isCreate() && !editing()}>
            <div id="syncSection" class="card shadow-sm bg-base-100">
              <div class="card-body">
                <h2 class="card-title">
                  OneDrive 云端同步
                  <input
                    type="checkbox"
                    checked={autoSync()}
                    class="toggle"
                    onChange={(e) => {
                      setAutoSync(e.target.checked);
                    }}
                  ></input>
                </h2>
                <Show when={loanData()?.prev_file_id}>
                  {(file_id) => {
                    return (
                      <div>
                        <Suspense
                          fallback={
                            <button class="btn btn-sm btn-link" disabled>
                              历史计划
                              <span class="loading loading-sm loading-spinner mx-1"></span>
                            </button>
                          }
                        >
                          <div>
                            <button
                              class="btn btn-sm btn-link"
                              disabled={!prevFileMeta()?.name}
                              onClick={() => {
                                setSearchParams(
                                  {
                                    file_id: file_id(),
                                    file_name: prevFileMeta()?.name,
                                  },
                                  {
                                    replace: false,
                                  },
                                );
                              }}
                            >
                              历史计划
                            </button>
                          </div>
                        </Suspense>
                      </div>
                    );
                  }}
                </Show>
                <div id="syncStatus">
                  <SyncStatus loanData={loanData()} loading={loading()} />
                </div>
              </div>
            </div>
          </Show>
          <div id="inputSection" class="card shadow-sm bg-base-100">
            <div class="card-body">
              <h2 class="card-title">贷款信息</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-gray-700 font-medium mb-2">
                    本金 (元)
                  </label>
                  <input
                    type="number"
                    id="principal"
                    disabled={!isCreate()}
                    onChange={(e) => {
                      setPrincipal(e.target.value);
                      setLoanData();
                    }}
                    value={getPrincipal()}
                    class="w-full input"
                  />
                </div>
                <div>
                  <label class="block text-gray-700 font-medium mb-2">
                    期数 (月)
                  </label>
                  <input
                    type="number"
                    id="periods"
                    disabled={!isCreate() && !editing()}
                    value={getPeriods()}
                    onChange={(e) => {
                      setPeriods(e.target.value);
                      setLoanData();
                    }}
                    class="w-full input"
                  />
                </div>
                <div>
                  <label class="block text-gray-700 font-medium mb-2">
                    年利率 (%)
                  </label>
                  <input
                    type="number"
                    id="rate"
                    step="0.01"
                    disabled={!isCreate() && !editing()}
                    value={getRate()}
                    onChange={(e) => {
                      setRate(e.target.value);
                      setLoanData();
                    }}
                    class="w-full input"
                  />
                </div>
                <div>
                  <label class="block text-gray-700 font-medium mb-2">
                    还款方式
                  </label>
                  <select
                    id="repaymentType"
                    class="w-full select"
                    value={getRepaymentType()}
                    disabled={!isCreate() && !editing()}
                    onChange={(e) => {
                      setRepaymentType(e.target.value);
                      setLoanData();
                    }}
                  >
                    <option value={RepaymentType.EQUAL_PRINCIPAL_INTEREST}>
                      等额本息
                    </option>
                    <option value={RepaymentType.EQUAL_PRINCIPAL}>
                      等额本金
                    </option>
                  </select>
                </div>
              </div>
              <div class="mt-4 card-actions">
                <Show when={isCreate() || editing()}>
                  <button
                    id="calculateBtn"
                    onClick={() => {
                      const principal = parseFloat(getPrincipal());
                      const periods = parseInt(getPeriods());
                      const rate = parseFloat(getRate());
                      const repaymentType = getRepaymentType();

                      const data = calculateRepaymentPlan(
                        principal,
                        periods,
                        rate,
                        repaymentType,
                      );
                      if (data) {
                        data.lastModifiedAt = Date.now();
                        data.lastSyncedAt = 0; // 尚未同步
                        setLoanData(data);
                      } else {
                        alert("请填写完整且有效的贷款信息");
                      }
                    }}
                    class="btn btn-primary"
                  >
                    计算还款计划
                  </button>
                </Show>
                <Show when={isCreate() || editing()}>
                  <Show when={loanData()}>
                    {(data) => {
                      return (
                        <button
                          class="btn btn-success"
                          onClick={() => {
                            setEditFileName(fileName());
                            setModal({
                              visible: true,
                              title: "创建还款计划",
                              loading: false,
                              onOk: () => {
                                if (!editFileName()) {
                                  return;
                                }
                                setModal((prev) => {
                                  return {
                                    ...prev,
                                    loading: true,
                                  };
                                });
                                uploadToOnedrive(data(), {
                                  file_name: editFileName(),
                                }).then(
                                  (res) => {
                                    setModal((prev) => {
                                      return {
                                        ...prev,
                                        loading: false,
                                        visible: false,
                                      };
                                    });
                                    setPrevLoanData();
                                    setEditing(false);
                                    setSearchParams(
                                      {
                                        file_id: res.id,
                                        folder_id: folderId(),
                                        file_name: editFileName(),
                                      },
                                      { replace: true },
                                    );
                                  },
                                  () => {
                                    setModal((prev) => {
                                      return {
                                        ...prev,
                                        loading: false,
                                      };
                                    });
                                  },
                                );
                              },
                            });
                          }}
                        >
                          保存计划
                        </button>
                      );
                    }}
                  </Show>
                </Show>
                <Show when={(!isCreate() && loanData()) || editing()}>
                  <button
                    class="btn"
                    onClick={() => {
                      if (editing()) {
                        setEditing(false);
                        setLoanData(prevLoanData());
                        setPrevLoanData();
                      } else {
                        setEditing(true);
                        const data = loanData();
                        if (data) {
                          syncFormFromData({
                            ...data,
                            periods: data.periods - data.currentPeriod,
                            principal: data.plan[data.currentPeriod].remaining,
                            plan: [],
                          });
                        }
                        setPrevLoanData(loanData());
                        setLoanData();
                      }
                    }}
                    classList={{ "btn-primary": !editing() }}
                  >
                    {!editing() ? "更改还款计划" : "取消更改"}
                  </button>
                </Show>
              </div>
            </div>
          </div>

          <div
            id="resultSection"
            class="flex flex-col gap-y-2"
            classList={{
              hidden: !loanData() || loading(),
            }}
          >
            <div class="card shadow-sm bg-base-100">
              <div class="card-body">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="card-title">还款计划</h2>
                  <div class="flex space-x-2">
                    <button
                      id="payBtn"
                      disabled={thru(
                        loanData(),
                        (loanData) =>
                          loanData &&
                          loanData.currentPeriod >= loanData.plan.length,
                      )}
                      onClick={makePayment}
                      class="btn btn-primary"
                    >
                      本期还款
                    </button>
                    <button
                      id="undoBtn"
                      disabled={thru(
                        loanData(),
                        (loanData) => !loanData?.paymentHistory.length,
                      )}
                      onClick={undoPayment}
                      class="btn btn-warning"
                    >
                      撤销还款
                    </button>
                  </div>
                </div>

                <Summary loanData={loanData()} />

                <div class="max-h-80 overflow-y-auto">
                  <PlanTable loanData={loanData()} />
                </div>
              </div>
            </div>

            <div class="card shadow-sm bg-base-100">
              <div class="card-body">
                <h2 class="card-title">还款记录</h2>
                <History loanData={loanData()} />
              </div>
            </div>
          </div>
        </div>
        <Modal
          visible={modal().visible}
          title={modal().title}
          content={
            <fieldset class="fieldset">
              <legend class="fieldset-legend">文件名</legend>
              <Input
                required
                value={editFileName()}
                onChange={(e) => {
                  setEditFileName(e.target.value?.trim());
                }}
                placeholder="请输入"
              />
            </fieldset>
          }
          loading={modal().loading}
          onOk={() => {
            modal().onOk();
          }}
          onCancel={() => {
            setModal((prev) => {
              return {
                ...prev,
                visible: false,
              };
            });
          }}
        />
      </div>
    </>
  );
}

export default NeedLoggedIn(Home);
