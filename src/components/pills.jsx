import { Pill } from './ui';
import { useConfig } from '../context/ConfigContext';
import { findStatus } from '../lib/statuses';
import {
  PRIORITIES, TASK_STATUSES, REVIEW_OUTCOMES, CAMPAIGN_STATUSES, CREATOR_STATUSES,
  DELIVERABLE_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, STAFF_STATUSES, findOpt,
} from '../lib/constants';

const make = (list) => function StatusPill({ value }) {
  const o = findOpt(list, value);
  return <Pill tone={o.tone}>{o.label}</Pill>;
};

// Status content datang dari Settings, jadi ia perlu baca config.
export function ContentStatusPill({ value }) {
  const config = useConfig();
  const s = findStatus(config, value);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const PriorityPill = make(PRIORITIES);
export const TaskStatusPill = make(TASK_STATUSES);
export const CampaignStatusPill = make(CAMPAIGN_STATUSES);
export const CreatorStatusPill = make(CREATOR_STATUSES);
export const DeliverableStatusPill = make(DELIVERABLE_STATUSES);
export const ContractPill = make(CONTRACT_STATUSES);
export const PaymentPill = make(PAYMENT_STATUSES);
export const StaffStatusPill = make(STAFF_STATUSES);

export function ReviewPill({ review, showNone }) {
  if (!review?.outcome) return showNone ? <Pill tone="gray">Belum disemak</Pill> : null;
  const o = findOpt(REVIEW_OUTCOMES, review.outcome);
  return <Pill tone={o.tone} strong>{o.label}</Pill>;
}

export function SlotPill() {
  return <Pill tone="gray">Slot kosong</Pill>;
}
