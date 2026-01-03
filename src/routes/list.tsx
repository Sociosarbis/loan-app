// src/components/FileListPage.jsx
import { useNavigate } from "@solidjs/router";
import { createSignal, For, onMount, Show, useContext } from "solid-js";
import { AppContext } from "~/stores";
import { NeedLoggedIn } from "~/stores/user";

const PAGE_SIZE = 20;

function FileListPage() {
  const { fileStore, userStore, toastStore, oneDriveClient } =
    useContext(AppContext);
  const [loading, setLoading] = createSignal(false);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [pageLinks, setPageLinks] = createSignal<string[]>([]); // 缓存每一页的 URL
  const navigate = useNavigate();

  // ========== 获取或创建 loan_records 文件夹 ==========
  const getOrCreateLoanRecordsFolder = async () => {
    const rootItems = await oneDriveClient.listFiles();
    const existingFolder = rootItems.value.find(
      (item) => item.folder && item.name === "loan_records"
    );
    if (existingFolder) return existingFolder.id;

    return oneDriveClient.createFolder({ name: "loan_records" });
  };

  // ========== 加载指定页 ==========
  const loadPage = async (pageNum: number) => {
    setLoading(true);
    try {
      const url = pageLinks()[pageNum - 1];
      const { items, nextLink } = await oneDriveClient.fetchPage(url);
      const filesOnly = items.filter((item) => !item.folder);

      fileStore.set("files", filesOnly);
      setCurrentPage(pageNum);

      // 如果是“下一页”操作，且有 nextLink，则缓存它
      if (nextLink && pageNum >= pageLinks().length) {
        setPageLinks((prev) => [...prev, nextLink]);
      }
    } catch (err) {
      toastStore.showMessage({
        text: (err as Error).message || "加载页面失败",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  onMount(async () => {
    setLoading(true);
    try {
      const folderId = await getOrCreateLoanRecordsFolder();
      if (!userStore.state.accessToken) {
        return;
      }
      fileStore.set("folderId", folderId);
      await loadFirstPage();
    } catch (e) {
      toastStore.showMessage({ text: (e as Error).message, type: "error" });
    }
    setLoading(false);
  });

  const loadFirstPage = () => {
    const firstUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileStore.state.folderId}/children?$top=${PAGE_SIZE}`;
    setPageLinks([firstUrl]);
    return loadPage(1);
  };

  const loadPrevPage = () => {
    return loadPage(currentPage() - 1);
  };

  const loadNextPage = () => {
    return loadPage(currentPage() + 1);
  };

  return (
    <>
      <div class="navbar bg-base-100 shadow-sm sticky top-0 z-10">
        <h1 class="flex-1 text-xl font-bold">贷款计划</h1>
        <div class="flex-none flex gap-x-2">
          <button
            onClick={() => {
              navigate(
                `/?${new URLSearchParams({
                  folder_id: fileStore.state.folderId?.toString() ?? "",
                })}`
              );
            }}
            class="btn btn-primary btn-sm"
          >
            + 创建计划
          </button>
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              userStore.setTokens({});
            }}
          >
            退出
          </button>
        </div>
      </div>
      <div class="container mx-auto pt-8">
        <Show
          when={!loading()}
          fallback={
            <div class="text-center py-8">
              <span class="loading loading-spinner mr-2"></span>加载中...
            </div>
          }
        >
          <>
            <Show
              when={fileStore.state.files.length}
              fallback={
                <div class="text-center py-8 text-gray-500">
                  该文件夹下暂无文件
                </div>
              }
            >
              <ul class="list bg-base-100 rounded-box shadow-md">
                <For each={fileStore.state.files}>
                  {(file) => {
                    return (
                      <li class="list-row">
                        <div class="list-col-grow">
                          <div class="font-medium">{file.name}</div>
                          <div class="text-xs text-gray-500">
                            修改于{" "}
                            {new Date(
                              file.lastModifiedDateTime
                            ).toLocaleString()}
                          </div>
                        </div>
                        <button
                          class="btn btn-sm btn-outline btn-primary"
                          onClick={() => {
                            navigate(
                              `/?${new URLSearchParams({
                                file_name: file.name,
                                folder_id: fileStore.state.folderId ?? "",
                              }).toString()}`
                            );
                          }}
                        >
                          编辑
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
            {/* 分页控件 */}
            <div class="mt-6 flex justify-between items-center">
              <div class="text-sm text-gray-600">
                第<span class="font-medium mx-1">{currentPage()}</span>页
              </div>
              <div class="flex gap-2">
                <button
                  onClick={loadFirstPage}
                  disabled={currentPage() === 1 || loading()}
                  class="btn btn-sm btn-ghost"
                >
                  首页
                </button>
                <button
                  onClick={loadPrevPage}
                  disabled={currentPage() <= 1 || loading()}
                  class="btn btn-sm btn-ghost"
                >
                  上一页
                </button>
                <button
                  onClick={loadNextPage}
                  disabled={loading() || !pageLinks()[currentPage()]}
                  class="btn btn-sm btn-ghost"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        </Show>
      </div>
    </>
  );
}

export default NeedLoggedIn(FileListPage);
