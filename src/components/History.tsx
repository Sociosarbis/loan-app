import { thru } from "lodash-es";
import { For, Show } from "solid-js";
import { LoanData } from "~/types/LoanData";
import { formatMoney } from "~/utils";

export function History(props: { loanData?: LoanData }) {
  return (
    <Show when={props.loanData}>
      {(loanData) => {
        return (
          <Show
            when={loanData().paymentHistory.length > 0}
            fallback={<p class="text-gray-500">暂无还款记录</p>}
          >
            <div id="historyList" class="list max-h-80 overflow-y-auto">
              <For each={loanData().paymentHistory.toReversed()}>
                {(record) => {
                  return (
                    <div class="list-row">
                      <div class="flex justify-between list-col-grow">
                        <span class="font-medium">
                          第
                          <span class="font-bold text-blue-600 mx-1">
                            {record.period}
                          </span>
                          期还款
                        </span>
                        <span class="text-sm text-gray-500">
                          {new Date(record.date).toLocaleString()}
                        </span>
                      </div>
                      <div class="list-col-wrap grid grid-cols-3 gap-2 mt-1 text-sm">
                        <div>
                          <span class="text-gray-500 font-medium">
                            还款金额：
                          </span>
                          ¥{record.payment}
                        </div>
                        <div>
                          <span class="text-gray-500 font-medium"> 本金：</span>
                          ¥{formatMoney(record.principal)}
                        </div>
                        <div>
                          <span class="text-gray-500 font-medium">利息：</span>{" "}
                          ¥{formatMoney(record.interest)}
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        );
      }}
    </Show>
  );
}
