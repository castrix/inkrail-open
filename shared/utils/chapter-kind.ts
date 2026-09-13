export function classifyTwkanChapter(title: string): 'MAIN' | 'EXTRA' | 'ANNOUNCEMENT' | 'UNKNOWN' {
  if (/第[零一二三四五六七八九十百千萬\d]+[章節回]/.test(title)) return 'MAIN'
  if (/(月票|抽獎|公告|通知|請假|上架感言|完本感言|月末總結|結果公示|更新說明)/i.test(title)) return 'ANNOUNCEMENT'
  if (/(番外|後記|序章|楔子)/i.test(title)) return 'EXTRA'
  return 'UNKNOWN'
}
