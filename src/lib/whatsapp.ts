import { money } from "@/lib/format";
import type { Estimate, JobFull } from "@/lib/types";

const CENTRE = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";

/** wa.me link that opens WhatsApp with the message already typed. The person only has to press Send. */
export function waLink(phone: string, text: string): string {
  const d = phone.replace(/\D/g, "");
  const full = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

const product = (j: JobFull) => [j.device.brand, j.device.model_no].filter(Boolean).join(" ") || j.category?.name || "product";

export type WaKind = "taken" | "estimate" | "ready";

export const WA_LABEL: Record<WaKind, string> = {
  taken: "Taken for repair",
  estimate: "Estimate",
  ready: "Ready for delivery",
};

export function msgReceived(name: string, productName: string, jobNo: string): string {
  return (
    `Dear ${name},\n` +
    `Your ${productName} has been received for repair at ${CENTRE}.\n` +
    `Job No: ${jobNo}\n` +
    `We will update you once the diagnosis is complete. Please quote the job number for any enquiry.`
  );
}

export function msgTaken(j: JobFull): string {
  return msgReceived(j.customer.name, product(j), j.job_no);
}

export function msgEstimate(j: JobFull, e: Estimate): string {
  const lines = e.lines.map((l, i) => `${i + 1}. ${l.description} x${l.qty} - ${money(l.amount)}`).join("\n");
  return (
    `Dear ${j.customer.name},\n` +
    `Estimate for your ${product(j)} (Job No: ${j.job_no}):\n` +
    (lines ? `${lines}\n` : "") +
    (Number(e.service_charge) > 0 ? `Service charge - ${money(Number(e.service_charge))}\n` : "") +
    `Total estimate: ${money(Number(e.total))}\n` +
    `Please reply YES to approve the repair or NO to decline.\n- ${CENTRE}`
  );
}

export function msgReady(j: JobFull, due: number): string {
  return (
    `Dear ${j.customer.name},\n` +
    `Your ${product(j)} (Job No: ${j.job_no}) is ready for delivery.\n` +
    (due > 0 ? `Amount to pay: ${money(due)}\n` : "") +
    `Please collect it during working hours and carry this message or your job number.\n- ${CENTRE}`
  );
}
