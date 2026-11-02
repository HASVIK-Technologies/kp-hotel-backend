export interface Enquiry {
  id: string;
  kind: "Banquet" | "Conference" | "Table" | "Contact";
  name: string;
  email?: string;
  mobile?: string;
  date?: string;
  summary: string;
  details: Record<string, unknown>;
  status: "New" | "Contacted" | "Closed";
  createdAt: string;
}
