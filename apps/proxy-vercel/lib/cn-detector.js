// 中国域名 / 站点检测
// 判断目标 URL 是否需要通过中国 IP 访问（即目标源在中国）

// 顶级域名后缀：.cn 及其二级子域
const CN_TLDS = [
  '.cn',
  '.com.cn',
  '.net.cn',
  '.org.cn',
  '.gov.cn',
  '.edu.cn',
  '.mil.cn',
  '.ac.cn',
  '.ah.cn',
  '.bj.cn',
  '.cq.cn',
  '.fj.cn',
  '.gd.cn',
  '.gs.cn',
  '.gz.cn',
  '.gx.cn',
  '.ha.cn',
  '.hb.cn',
  '.he.cn',
  '.hi.cn',
  '.hk.cn',
  '.hn.cn',
  '.jl.cn',
  '.js.cn',
  '.jx.cn',
  '.ln.cn',
  '.mo.cn',
  '.nm.cn',
  '.nx.cn',
  '.qh.cn',
  '.sc.cn',
  '.sd.cn',
  '.sh.cn',
  '.sn.cn',
  '.sx.cn',
  '.tj.cn',
  '.tw.cn',
  '.xj.cn',
  '.xz.cn',
  '.yn.cn',
  '.zj.cn',
]

// 已知中国音乐/视频/互联网站点（非 .cn 后缀但需要中国 IP）
const CN_SITES = [
  // 网易云相关
  'music.163.com',
  'interface.music.163.com',
  'interface3.music.163.com',
  'musicapi.163.com',
  'api.music.163.com',
  // QQ 音乐 / 腾讯相关
  'y.qq.com',
  'u.y.qq.com',
  'i.y.qq.com',
  'c.y.qq.com',
  'api.y.qq.com',
  'list.qq.com',
  'imgcache.qq.com',
  'minorshort.video.qq.com',
  'video.qq.com',
  'v.qq.com',
  // 酷狗 / 酷我
  'www.kugou.com',
  'www.kuwo.cn',
  'api.kuwo.cn',
  'antiserver.kuwo.cn',
  'star.kuwo.cn',
  // 喜马拉雅 / 蜻蜓 FM
  'www.ximalaya.com',
  'www.qingting.fm',
  // bilibili
  'www.bilibili.com',
  'api.bilibili.com',
  'i0.hdslb.com',
  'i1.hdslb.com',
  'i2.hdslb.com',
  'i3.hdslb.com',
  // 抖音 / 字节
  'www.douyin.com',
  'api.douyin.com',
  'www.ixigua.com',
  // 快手
  'www.kuaishou.com',
  // 百度 / 贴吧
  'www.baidu.com',
  'tieba.baidu.com',
  'music.taihe.com',
  // 阿里
  'www.taobao.com',
  'www.tmall.com',
  'www.alibaba.com',
  'www.1688.com',
  'h5.m.taobao.com',
  // 京东
  'www.jd.com',
  // 其他常见
  'music.qq.com',
  'api.qijieya.cn',
  'api.vkeys.cn',
  'www.qqmp3.vip',
  'buguyy.top',
  'www.buguyy.top',
  // 微博
  'weibo.com',
  'www.weibo.com',
  'm.weibo.cn',
  // 小红书
  'www.xiaohongshu.com',
  // 知乎
  'www.zhihu.com',
  'www.zhuanlan.zhihu.com',
]

// 归一化域名（转小写、去掉端口）
function normalizeHost(host) {
  if (!host) return ''
  return host.toLowerCase().split(':')[0]
}

/**
 * 判断一个 URL 的目标源是否在中国
 * @param {string} url - 目标 URL
 * @returns {boolean} true 表示需要用中国 IP 代理
 */
function isChinaTarget(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const host = normalizeHost(parsed.hostname)
  if (!host) return false

  // 1. 命中已知中国站点列表（精确匹配）
  if (CN_SITES.includes(host)) return true

  // 2. 域名后缀匹配 .cn / .com.cn 等
  for (const tld of CN_TLDS) {
    if (host === tld.replace(/^\./, '') || host.endsWith(tld)) {
      return true
    }
  }

  // 3. 子域名匹配 CN_SITES（api.foo.com 这种）
  for (const site of CN_SITES) {
    if (host.endsWith('.' + site)) {
      return true
    }
  }

  return false
}

module.exports = { isChinaTarget }
