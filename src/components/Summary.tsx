import { Show } from "solid-js";
import { LoanData } from "~/types/LoanData";
import { formatMoney } from "~/utils";

export function Summary(props: { loanData?: LoanData }) {
  return (
    <Show when={props.loanData}>
      {(loanData) => {
        const current = () => loanData().currentPeriod;
        const nextPayment = () =>
          current() < loanData().plan.length
            ? loanData().plan[current()].payment
            : 0;
        const remainingPrincipal = () =>
          current() > 0 && current() <= loanData().plan.length
            ? loanData().plan[current() - 1].remaining
            : current() === 0
            ? loanData().principal
            : 0;
        return (
          <div id="summary" class="mb-4 p-4 bg-blue-50 rounded-lg">
            <div class="stats w-full">
              <div class="stat">
                <p class="stat-title">当前期数</p>
                <p class="stat-value">{current()}</p>
              </div>
              <div class="stat">
                <p class="stat-title">下期还款</p>
                <p class="stat-value">¥{nextPayment()}</p>
              </div>
              <div class="stat">
                <p class="stat-title">剩余本金</p>
                <p class="stat-value">¥{formatMoney(remainingPrincipal())}</p>
              </div>
              <div class="stat">
                <p class="stat-title">已还期数</p>
                <p class="stat-value">{current()}</p>
              </div>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
