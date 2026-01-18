export type LoanData = {
  prev_file_id?: string
  currentPeriod: number;
  principal: number;
  periods: number;
  annualRate: number;
  repaymentType: string;
  plan: Array<{ period: number; payment: number; principal: number; interest: number; remaining: number }>
  paymentHistory: Array<{ date: string; period: number; payment: number; principal: number; interest: number }>
  lastModifiedAt: number;
  lastSyncedAt: number;
}