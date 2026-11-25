import { headers } from './config.js'

export function jsonResp(data, status = 200) {
  return Response.json(data, { headers, status })
}

/**
 * 上游歌曲接口地址映射：加歌与取播放地址共用
 * @returns {string} 不支持的 source 返回空串
 */
