/**
 * Where an order stands with money. Entries are what has happened with the client's money:
 * - payment:   money in (transfer, QRIS, cash, or the client's credit)
 * - refund:    money sent back, after something was called off
 * - to_credit: money kept as credit for the client's next order instead of sent back
 * The DP (down payment) is a share of the total she asks for first; null when she asks for none.
 */
export type MoneyEntry = { kind: "payment" | "refund" | "to_credit"; amount: number };

export type PaymentStatus = "unpaid" | "partial" | "dp_paid" | "paid" | "overpaid";

export type Balance = {
  /** Kept by her: payments minus refunds and money moved to credit. */
  paid: number;
  due: number;
  dpAmount: number | null;
  dpDue: number;
  /** Paid beyond the total: to refund or move to credit. */
  overpaid: number;
  status: PaymentStatus;
};

export function orderBalance(total: number, dpPercent: number | null, entries: MoneyEntry[]): Balance {
  const paid = entries.reduce((sum, e) => sum + (e.kind === "payment" ? e.amount : -e.amount), 0);
  const due = Math.max(0, total - paid);
  const overpaid = Math.max(0, paid - total);
  const dpAmount = dpPercent === null ? null : Math.ceil((total * dpPercent) / 100);
  const dpDue = dpAmount === null ? 0 : Math.max(0, dpAmount - paid);
  const status: PaymentStatus =
    overpaid > 0 ? "overpaid"
    : due === 0 ? "paid"
    : paid <= 0 ? "unpaid"
    : dpAmount !== null && dpDue === 0 ? "dp_paid"
    : "partial";
  return { paid, due, dpAmount, dpDue, overpaid, status };
}
