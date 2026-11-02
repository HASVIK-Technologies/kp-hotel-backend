export interface Customer {
  id: string;
  name: string;
  company: string;
  gstin: string;
  stateCode: string;
  email: string;
  mobile?: string;
  address?: string;
  creditDays: number;
  createdAt: string;
}

