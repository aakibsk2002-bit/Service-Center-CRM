export type Role = "admin" | "crm" | "engineer";

export type Status =
  | "inward"
  | "in_repair"
  | "pending_spares"
  | "pending_tech"
  | "pending_approval"
  | "ready"
  | "outward";

export const STATUSES: Status[] = [
  "inward",
  "in_repair",
  "pending_spares",
  "pending_tech",
  "pending_approval",
  "ready",
  "outward",
];

export const STATUS_LABEL: Record<Status, string> = {
  inward: "Inward (not taken)",
  in_repair: "In Repair",
  pending_spares: "Pending for Spares",
  pending_tech: "Pending for Tech Support",
  pending_approval: "Pending for Approval",
  ready: "Ready",
  outward: "Outward (Closed)",
};

export const STATUS_COLOR: Record<Status, string> = {
  inward: "bg-amber-100 text-amber-800",
  in_repair: "bg-blue-100 text-blue-800",
  pending_spares: "bg-orange-100 text-orange-800",
  pending_tech: "bg-purple-100 text-purple-800",
  pending_approval: "bg-yellow-100 text-yellow-900",
  ready: "bg-green-100 text-green-800",
  outward: "bg-slate-200 text-slate-700",
};

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  eng_code: string | null;
  active: boolean;
  username?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  contact_person: string | null;
  phone: string;
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  needs_pickup_test?: boolean;
}

export interface Device {
  id: string;
  category_id: number;
  brand: string | null;
  model_no: string | null;
  serial_no: string | null;
  purchase_date: string | null;
}

export interface PersonRef {
  full_name: string;
  eng_code: string | null;
}

export interface Job {
  id: string;
  job_no: string;
  customer_id: string;
  device_id: string;
  category_id: number;
  call_type: "WAR" | "OW" | "CP_AMC" | null;
  service_type: "onsite" | "carry_in" | "one_hour" | null;
  call_reason: "PM" | "BD" | "INS" | "OTHER" | null;
  warranty_status: "in_warranty" | "out_of_warranty" | "amc" | "unknown" | null;
  reported_problem: string | null;
  accessories: string[];
  extra_fields: Record<string, string>;
  observed_problem: string | null;
  action_taken: string | null;
  customer_feedback: string | null;
  feedback_note: string | null;
  rma_no: string | null;
  issue_category_id?: number | null;
  internal_note?: string | null;
  issue?: { name: string; needs_pickup_test: boolean } | null;
  status: Status;
  received_by: string | null;
  repair_engineer: string | null;
  inward_sign_path: string | null;
  outward_sign_path: string | null;
  received_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  outward_at: string | null;
  repair_started_at: string | null;
  outward_by: string | null;
  updated_at: string;
  quotation_requested_at: string | null;
  quotation_note: string | null;
  repair_declined: boolean;
  unlocked_at: string | null;
  unlocked_by: string | null;
  unlock_reason: string | null;
  pages_in: number | null;
  pages_out: number | null;
  pickup_test_done: boolean;
  pickup_test_at: string | null;
  visit_location_id: string | null;
  visit_km: number | null;
  visit_address: string | null;
  visited_at: string | null;
  visit_engineer: string | null;
  service_charge: number;
  discount: number;
  on_credit: boolean;
}

export interface JobFull extends Job {
  customer: Customer;
  device: Device;
  category: Category;
  received: PersonRef | null;
  repair: PersonRef | null;
  outwarder: PersonRef | null;
}

export interface JobPart {
  id: string;
  job_id: string;
  part_id: string | null;
  description: string;
  part_number: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
  serial_no?: string | null;
  head_id?: string | null;
  source_type?: "stock" | "doa_printer" | "other_asset";
  donor_serial?: string | null;
  source_note?: string | null;
  state: "requested" | "issued" | "cancelled";
  requested_at: string;
  issued_at: string | null;
}

export const JOB_SELECT =
  "*, customer:customers(*), device:devices(*), category:product_categories(*), issue:issue_categories(name,needs_pickup_test), " +
  "received:profiles!job_cards_received_by_fkey(full_name,eng_code), " +
  "repair:profiles!job_cards_repair_engineer_fkey(full_name,eng_code), " +
  "outwarder:profiles!job_cards_outward_by_fkey(full_name,eng_code)";

export const CALL_TYPE_LABEL: Record<string, string> = {
  WAR: "Warranty (WAR)",
  OW: "Out of Warranty (OW)",
  CP_AMC: "CP / AMC",
};
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  onsite: "Site visit",
  carry_in: "Carry-in",
  one_hour: "1 Hour",
};
export const WARRANTY_LABEL: Record<string, string> = {
  in_warranty: "In Warranty",
  out_of_warranty: "Out of Warranty",
  amc: "AMC",
  unknown: "Unknown",
};
export const FEEDBACK_LABEL: Record<string, string> = {
  satisfied: "Serviced to my satisfaction",
  not_satisfied_fully: "Serviced but not satisfied",
  under_observation: "Serviced but under observation",
  not_satisfied: "Not satisfied",
  other: "Others",
};

// ---------- money, stock, reports ----------
export type PayMode = "cash" | "online";

export const MODE_LABEL: Record<string, string> = { cash: "Cash", online: "Online / UPI" };

export interface StockItem {
  id: string;
  part_number: string | null;
  description: string;
  price: number; // selling price
  cost_price: number;
  stock_qty: number;
  min_stock: number;
  active: boolean;
  is_service: boolean;
  track_serial?: boolean;
  is_head?: boolean;
  product_name?: string | null;
  part_category?: string | null;
  ref_no?: string | null;
  specification?: string | null;
  manufacturer_code?: string | null;
  remark?: string | null;
}

export interface StockMove {
  id: number;
  part_id: string;
  qty_change: number;
  kind: "opening" | "purchase" | "issue" | "return" | "adjust";
  note: string | null;
  unit_cost: number | null;
  created_at: string;
  part: { description: string } | null;
  by: { full_name: string } | null;
  job: { job_no: string } | null;
}

export interface Payment {
  id: string;
  job_id: string;
  amount: number;
  mode: PayMode;
  reference: string | null;
  note: string | null;
  paid_at: string;
  by: { full_name: string } | null;
}

export interface ReportJob {
  job_id: string;
  job_no: string;
  customer_id: string;
  customer_name: string;
  phone: string;
  category_id: number;
  category_name: string;
  brand: string | null;
  model_no: string | null;
  serial_no: string | null;
  status: Status;
  received_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  outward_at: string | null;
  received_by_id: string | null;
  received_by_name: string | null;
  repair_by_id: string | null;
  repair_by_name: string | null;
  service_charge: number;
  parts_revenue: number;
  parts_cost: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  profit: number;
  on_credit: boolean;
  extra_fields: Record<string, string>;
}

export interface DayEvent {
  event_at: string;
  kind: "inward" | "ready" | "outward" | "part" | "payment";
  job_id: string;
  job_no: string;
  customer_name: string;
  detail: string | null;
  amount: number | null;
  mode: string | null;
  by_name: string | null;
}

export interface Summary {
  jobs_in: number;
  jobs_ready: number;
  jobs_out: number;
  revenue: number;
  parts_cost: number;
  profit: number;
  cash: number;
  online: number;
  credit_given: number;
  credit_outstanding: number;
  by_category: { category: string; jobs: number; revenue: number; profit: number }[];
}

export interface CustomerRow {
  customer_id: string;
  customer_name: string;
  phone: string;
  jobs: number;
  revenue: number;
  parts_cost: number;
  profit: number;
  paid: number;
  due: number;
}

export interface EngineerRow {
  engineer_id: string;
  full_name: string;
  eng_code: string | null;
  role: string;
  received_count: number;
  repaired_count: number;
  ready_count: number;
  outward_count: number;
  avg_days_to_ready: number | null;
  revenue: number;
  profit: number;
}

export interface VisitLocation {
  id: string;
  name: string;
  address: string | null;
  km: number;
  active: boolean;
}

export interface EstimateLine {
  description: string;
  part_number: string | null;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface Estimate {
  id: string;
  job_id: string;
  created_at: string;
  lines: EstimateLine[];
  parts_total: number;
  service_charge: number;
  total: number;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  decided_at: string | null;
  decision_note: string | null;
}

export interface VisitRow {
  job_id: string;
  job_no: string;
  visited_on: string;
  engineer_id: string | null;
  engineer_name: string;
  customer_name: string;
  location_name: string | null;
  address: string | null;
  km: number | null;
}

export interface EmployeeDetails {
  profile_id: string;
  joining_date: string | null;
  leave_date: string | null;
  date_of_birth: string | null;
  personal_phone: string | null;
  personal_email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
}
