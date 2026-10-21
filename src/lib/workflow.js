// Syarat sebelum content boleh masuk sesuatu peringkat.
// Diikat pada PERINGKAT (stage), bukan nama status, supaya Admin bebas menamakan semula status.
import { stageOf } from './statuses';

export function missingForStatus(config, content, statusKey) {
  const stage = stageOf(config, statusKey);
  const missing = [];
  if (!content.title?.trim()) missing.push('title');
  if (stage === 'ready' && !content.publishDate) missing.push('publishDate');
  if (stage === 'published') {
    if (!content.publishUrl) missing.push('publishUrl');
    if (!content.publishedDate) missing.push('publishedDate');
  }
  if (['review', 'ready', 'published'].includes(stage) && !content.ownerStaffId) missing.push('ownerStaffId');
  return missing;
}

export const FIELD_LABELS = {
  title: 'Tajuk content',
  publishDate: 'Tarikh terbit',
  publishUrl: 'Link post',
  publishedDate: 'Tarikh sebenar terbit',
  ownerStaffId: 'Pemilik content',
};
