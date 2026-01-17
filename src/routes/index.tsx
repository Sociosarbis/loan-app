import {
  createEffect,
  createMemo,
  createSignal,
  JSXElement,
  onCleanup,
  onMount,
  Show,
  useContext,
} from "solid-js";
import { History } from "~/components/History";
import { PlanTable } from "~/components/PlanTable";
import { ONEDRIVE_CONFIG } from "~/config";
import { RepaymentType } from "~/consts";
import { LoanData } from "~/types/LoanData";
import { isString, thru } from "lodash-es";
import { Summary } from "~/components/Summary";
import { Modal } from "~/components/Modal";
import { AppContext } from "~/stores";
import { useNavigate, useSearchParams } from "@solidjs/router";
import dayjs from "dayjs";
import { NeedLoggedIn } from "~/stores/user";

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
      when={props.loanData}
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
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = createSignal(false);
  const [loanData, setLoanData] = createSignal<LoanData>();
  const [getPrincipal, setPrincipal] = createSignal<string>("10000");
  const [getPeriods, setPeriods] = createSignal<string>("12");
  const [getRate, setRate] = createSignal<string>("5.5");
  const navigate = useNavigate();
  const [getRepaymentType, setRepaymentType] = createSignal<string>(
    RepaymentType.EQUAL_PRINCIPAL_INTEREST,
  );
  const isLoggedIn = () => !!userStore.state.accessToken;
  const isCreate = () =>
    !(
      isString(searchParams.file_name) &&
      searchParams.file_name &&
      isString(searchParams.folder_id) &&
      searchParams.folder_id
    );
  const folderId = () => searchParams.folder_id?.toString() ?? "";
  const [modal, setModal] = createSignal({
    visible: false,
    title: "",
    content: "",
    loading: false,
    onOk: () => {},
  });
  const fileName = isCreate()
    ? `loan_calculator_data_${dayjs().format("YYYYMMDDHHmmss")}.json`
    : searchParams.file_name!.toString();

  let timerId: number | undefined;

  const showMessage = (text: string, isError = false) => {
    toastStore.showMessage({ text, type: isError ? "error" : "info" });
  };

  const downloadFromOnedrive = async () => {
    try {
      const metaRes = await oneDriveClient.fetchFileMeta({
        folder_id: folderId(),
        file_name: fileName,
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
    if (isLoggedIn() && data) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = window.setTimeout(() => {
        uploadToOnedrive(data);
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

  function syncFormFromData(data: LoanData) {
    if (!data) return;
    setPrincipal(data.principal.toString());
    setPeriods(data.periods.toString());
    setRate(data.annualRate.toString());
    setRepaymentType(
      data.repaymentType || RepaymentType.EQUAL_PRINCIPAL_INTEREST,
    );
  }

  const uploadToOnedrive = async (data: LoanData) => {
    try {
      const now = Date.now(); // ←←← 关键：标记已同步
      const res = await oneDriveClient.putFile({
        content: { ...data, lastSyncedAt: now },
        folder_id: folderId(),
        file_name: fileName,
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
        return true;
      } else {
        showMessage("❌ 上传失败", true);
        return false;
      }
    } catch (err) {
      showMessage("❌ 上传异常", true);
      return false;
    }
  };

  createEffect(async () => {
    if (!isCreate()) {
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
        <h1 class="text-xl font-bold text-gray-800">贷款复利计算器</h1>
      </div>
      <div class="container mx-auto pt-8">
        <div class="flex flex-col gap-y-4">
          <Show when={!isCreate()}>
            <div id="syncSection" class="card shadow-sm bg-base-100">
              <div class="card-body">
                <h2 class="card-title">OneDrive 云端同步</h2>
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
                    disabled={!isCreate()}
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
                    disabled={!isCreate()}
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
                    disabled={!isCreate()}
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
              <Show when={isCreate()}>
                <div class="mt-4 card-actions">
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
                  <Show when={loanData()}>
                    {(data) => {
                      return (
                        <button
                          class="btn btn-success"
                          onClick={() => {
                            setModal({
                              visible: true,
                              title: "创建还款计划",
                              content: `确定创建${fileName}？`,
                              loading: false,
                              onOk: () => {
                                setModal((prev) => {
                                  return {
                                    ...prev,
                                    loading: true,
                                  };
                                });
                                uploadToOnedrive(data()).then(
                                  () => {
                                    setModal((prev) => {
                                      return {
                                        ...prev,
                                        loading: false,
                                        visible: false,
                                      };
                                    });
                                    navigate(
                                      `/?${new URLSearchParams({
                                        file_name: fileName,
                                        folder_id: folderId(),
                                      })}`,
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
                </div>
              </Show>
            </div>
          </div>

          <div
            id="resultSection"
            class="flex flex-col gap-y-2"
            classList={{
              hidden: !loanData(),
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
          content={modal().content}
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
