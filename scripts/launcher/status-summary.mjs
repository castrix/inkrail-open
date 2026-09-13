export function summarize(groups) {
  const result = { active: 0, translation: 0, dictionary: 0, downloads: 0, art: 0, queued: 0, blocked: 0 }
  for (const group of groups) {
    const count = group._count._all
    if (group.status === 'PENDING') { result.queued += count; continue }
    if (['WAITING_FOR_ACCESS', 'PAUSED'].includes(group.status)) { result.blocked += count; continue }
    if (!['RUNNING', 'CANCEL_REQUESTED'].includes(group.status)) continue
    result.active += count
    if (['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION'].includes(group.type)) result.translation += count
    else if (['EXTRACT_ENTITIES', 'RECONCILE_DICTIONARY'].includes(group.type)) result.dictionary += count
    else if (['SCRAPE_CHAPTERS', 'DOWNLOAD_MANGA'].includes(group.type)) result.downloads += count
    else if (['GENERATE_CHARACTER_IMAGE', 'DETECT_CHARACTER_SKINS'].includes(group.type)) result.art += count
  }
  return result
}

export function statusQuery(now = Date.now()) {
  return {
    by: ['status', 'type'],
    where: { OR: [
      { status: { in: ['PENDING', 'WAITING_FOR_ACCESS', 'PAUSED'] } },
      { status: { in: ['RUNNING', 'CANCEL_REQUESTED'] }, updatedAt: { gte: new Date(now - 30_000) } }
    ] },
    _count: { _all: true }
  }
}
