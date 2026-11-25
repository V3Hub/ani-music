/**
 * 歌曲标签词表与图标规则
 * - PRESET_SONG_TAGS：用户打标签时只能从这里点选，保证标签有对应图标
 * - getTagIcon：按标签内容生成图标，供听歌模式的标签模式使用
 */

export interface PresetSongTag {
  tag: string
  icon: string
}

/** 可选标签（点选即添加 / 取消） */
export const PRESET_SONG_TAGS: PresetSongTag[] = [
  // 情绪
  { tag: '治愈', icon: 'flower-o' },
  { tag: '伤感', icon: 'like-o' },
  { tag: '温柔', icon: 'flower-o' },
  { tag: '浪漫', icon: 'flower-o' },
  { tag: '孤独', icon: 'like-o' },
  { tag: '快乐', icon: 'smile-o' },
  { tag: '热血', icon: 'fire-o' },
  // 场景
  { tag: '助眠', icon: 'closed-eye' },
  { tag: '晚安', icon: 'closed-eye' },
  { tag: '深夜', icon: 'closed-eye' },
  { tag: '清晨', icon: 'bulb-o' },
  { tag: '午后', icon: 'clock-o' },
  { tag: '雨天', icon: 'umbrella-circle' },
  { tag: '放松', icon: 'closed-eye' },
  { tag: '专注', icon: 'bookmark-o' },
  { tag: '学习', icon: 'bookmark-o' },
  { tag: '工作', icon: 'desktop-o' },
  { tag: '运动', icon: 'fire-o' },
  { tag: '健身', icon: 'fire-o' },
  { tag: '跑步', icon: 'fire-o' },
  { tag: '车载', icon: 'volume-o' },
  { tag: '旅行', icon: 'location-o' },
  { tag: '派对', icon: 'birthday-cake-o' },
  { tag: '新年', icon: 'gift-o' },
  // 风格
  { tag: '流行', icon: 'hot-o' },
  { tag: '热歌', icon: 'fire-o' },
  { tag: '新歌', icon: 'new-o' },
  { tag: '经典老歌', icon: 'clock-o' },
  { tag: '摇滚', icon: 'fire-o' },
  { tag: '说唱', icon: 'service-o' },
  { tag: '电音', icon: 'volume-o' },
  { tag: 'DJ', icon: 'volume-o' },
  { tag: '民谣', icon: 'music-o' },
  { tag: '爵士', icon: 'music-o' },
  { tag: '蓝调', icon: 'music-o' },
  { tag: '古风', icon: 'brush-o' },
  { tag: '国风', icon: 'brush-o' },
  { tag: '纯音乐', icon: 'music-o' },
  { tag: '轻音乐', icon: 'music-o' },
  { tag: '古典', icon: 'music-o' },
  { tag: '钢琴', icon: 'music-o' },
  { tag: '吉他', icon: 'music-o' },
  // 语言 / 地区
  { tag: '华语', icon: 'music-o' },
  { tag: '粤语', icon: 'music-o' },
  { tag: '日语', icon: 'star-o' },
  { tag: '英语', icon: 'flag-o' },
  { tag: '韩语', icon: 'star-o' },
  { tag: '欧美', icon: 'flag-o' },
  // 其他
  { tag: '二次元', icon: 'star-o' },
  { tag: '动漫', icon: 'star-o' },
  { tag: '游戏', icon: 'gem-o' },
  { tag: '影视原声', icon: 'video-o' },
  { tag: '儿歌', icon: 'smile-o' },
]

const PRESET_ICON_MAP = new Map(PRESET_SONG_TAGS.map(item => [item.tag, item.icon]))

/** 非预设标签的兜底图标规则：按内容匹配，命中的第一条生效 */
const TAG_ICON_RULES: Array<[RegExp, string]> = [
  [/助眠|睡眠|晚安|深夜|失眠|催眠|白噪音|夜晚|熬夜|午睡|午休/, 'closed-eye'],
  [/放松|减压|休闲|躺平|放空/, 'closed-eye'],
  [/emo|伤感|伤心|难过|孤独|失恋|遗憾|压抑|心碎|悲伤/i, 'like-o'],
  [/治愈|温柔|小清新|甜|恋爱|爱情|浪漫|告白|表白|温暖/, 'flower-o'],
  [/快乐|开心|愉快|欢乐|高兴|愉悦/, 'smile-o'],
  [/dj|电音|电子|舞曲|蹦迪|remix|车载|club/i, 'volume-o'],
  [/摇滚|rock|朋克|金属|燃|热血|激昂|运动|健身|跑步|锻炼|训练|律动/i, 'fire-o'],
  [/说唱|嘻哈|rap|hiphop|trap/i, 'service-o'],
  [/流行|热门|热歌|榜单|抖音|神曲|网络/, 'hot-o'],
  [/新歌|首发|新单/, 'new-o'],
  [/经典|怀旧|老歌|回忆|复古|年代|金曲/, 'clock-o'],
  [/学习|图书馆|读书|专注|自习|备考|刷题/, 'bookmark-o'],
  [/工作|办公|加班|码字/, 'desktop-o'],
  [/古风|国风|中国风|戏腔|水墨|汉服|仙侠/, 'brush-o'],
  [/acg|动漫|二次元|日语|日文|日系|vocaloid|初音/i, 'star-o'],
  [/英语|英文|欧美|billboard|格莱美/i, 'flag-o'],
  [/韩语|kpop|k-pop|韩剧/i, 'star-o'],
  [/纯音乐|轻音乐|钢琴|古典|instrumental|背景乐|交响|小提琴|民谣|吉他|爵士|jazz|蓝调|blues|灵魂|华语|国语|中文|粤语/i, 'music-o'],
  [/儿童|儿歌|宝宝|童谣/, 'smile-o'],
  [/旅行|开车|公路|风景|远方|徒步/, 'location-o'],
  [/游戏|电竞|bgm/i, 'gem-o'],
  [/电影|影视|原声|ost|主题曲|插曲|片尾/i, 'video-o'],
  [/生日|派对|party|庆祝|狂欢/i, 'birthday-cake-o'],
  [/圣诞|节日|新年|春节|跨年/, 'gift-o'],
  [/雨天|下雨|雨声|天气|暴雨/, 'umbrella-circle'],
  [/清晨|早晨|起床|早安|午后|下午茶/, 'bulb-o'],
]

/** 未命中任何规则时的默认标签图标 */
const DEFAULT_TAG_ICON = 'music-o'

/** 按规则匹配图标，未命中返回空串（区别于预设词表精确匹配） */
function getRuleIcon(tag: string): string {
  const matched = TAG_ICON_RULES.find(([pattern]) => pattern.test(tag))
  return matched?.[1] || ''
}

/** 根据标签内容生成图标：预设标签直接取词表图标，其余按规则兜底 */
export function getTagIcon(tag: string): string {
  const preset = PRESET_ICON_MAP.get(tag)
  if (preset)
    return preset
  return getRuleIcon(tag) || DEFAULT_TAG_ICON
}

/**
 * 模糊匹配评分（0 表示不匹配）：
 * 完全一致 > 名称包含 > 反向包含 > 子序列匹配（如输入「经歌」可命中「经典老歌」）
 */
function fuzzyScore(name: string, key: string): number {
  if (name === key)
    return 100
  if (name.includes(key))
    return Math.max(80 - (name.length - key.length), 60)
  if (key.includes(name))
    return 70
  let matched = 0
  let first = -1
  let last = -1
  for (let i = 0; i < name.length && matched < key.length; i++) {
    if (name[i] === key[matched]) {
      if (first < 0)
        first = i
      last = i
      matched++
    }
  }
  if (matched < key.length)
    return 0
  // 子序列越紧凑分数越高
  const span = last - first + 1
  return Math.max(50 - (span - key.length), 10)
}

/**
 * 输入联想：先按名称模糊匹配排序，
 * 再按 TAG_ICON_RULES 命中结果补充同类图标的标签，帮助用户输入
 */
export function matchPresetTags(keyword: string, limit = 8): PresetSongTag[] {
  const key = keyword.trim().toLowerCase()
  if (!key)
    return []
  const result = PRESET_SONG_TAGS
    .map(preset => ({ preset, score: fuzzyScore(preset.tag.toLowerCase(), key) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.preset)
    .slice(0, limit)

  // 名称匹配不足时，用规则命中的分类图标补充同类标签
  const ruleIcon = getRuleIcon(keyword)
  if (ruleIcon && result.length < limit) {
    for (const preset of PRESET_SONG_TAGS) {
      if (result.length >= limit)
        break
      if (preset.icon === ruleIcon && !result.includes(preset))
        result.push(preset)
    }
  }
  return result
}
