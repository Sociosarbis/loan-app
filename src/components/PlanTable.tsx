import { For, Show } from "solid-js";
import { LoanData } from "~/types/LoanData";
import { formatMoney } from "~/utils";
export function PlanTable(props: { loanData?: LoanData }) {
  return (
    <table id="planTable" class="table">
      <thead>
        <tr>
          <th class="py-2 px-4 text-left">期数</th>
          <th class="py-2 px-4 text-left">还款金额</th>
          <th class="py-2 px-4 text-left">本金</th>
          <th class="py-2 px-4 text-left">利息</th>
          <th class="py-2 px-4 text-left">剩余本金</th>
          <th class="py-2 px-4 text-left">状态</th>
        </tr>
      </thead>
      <tbody id="planBody">
        <Show when={props.loanData}>
          {(loanData) => {
            return (
              <For each={loanData().plan}>
                {(item, idx) => {
                  const status =
                    idx() < loanData().currentPeriod ? "已还" : "待还";
                  return (
                    <tr
                      classList={{
                        "paid-row": idx() < loanData().currentPeriod,
                        "bg-base-200": idx() === loanData().currentPeriod,
                      }}
                    >
                      <td class="py-2 px-4">{item.period}</td>
                      <td class="py-2 px-4">¥{item.payment}</td>
                      <td class="py-2 px-4">¥{formatMoney(item.principal)}</td>
                      <td class="py-2 px-4">¥{formatMoney(item.interest)}</td>
                      <td class="py-2 px-4">¥{formatMoney(item.remaining)}</td>
                      <td class="py-2 px-4">{status}</td>
                    </tr>
                  );
                }}
              </For>
            );
          }}
        </Show>
      </tbody>
    </table>
  );
}
