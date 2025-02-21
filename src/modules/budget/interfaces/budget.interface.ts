import { CreateBudgetDto } from "../dto/budget.dto";

export interface InitiateFundRequest {
  orgId: string
  userId: string
  type: string
  budgetId: string
}

export interface ApproveExpense  {
  budgetId?: string;
  request?: CreateBudgetDto & { userId: string;  orgId: string};
}

export type CreateNewBudget = CreateBudgetDto & {
  orgId: string;
  userId: string;
}; 