import { handleAddAdminMessage, handleAdminInboxList, handleAdminMessageDetail, handleAdminReplyMessage, handleDeleteAdminMessage, handleGetAdminMessages } from './admin-message.js'
import { handleAdminAddIpBlacklist, handleAdminBanUser, handleAdminDeleteUser, handleAdminListIpBlacklist, handleAdminListRegistrations, handleAdminListUsers, handleAdminRemoveIpBlacklist, handleAdminResetPassword, handleAdminReviewRegistration, handleAdminSetVipLevel, handleAdminUnbanUser, handleAdminVipRecords } from './admin.js'
import { handleAddComment, handleDeleteComment, handleGetCommentCount, handleGetComments, handleToggleCommentLike } from './comment.js'
import { handleAdminClearErrorLogs, handleAdminDeleteErrorLog, handleAdminListErrorLogs, handleAdminUpdateErrorLogStatus, handleReportErrorLog } from './error-log.js'
import { handleAddRecentPlay, handleGetHotList, handleGetRecentPlay, handleRemoveRecentPlay } from './hot.js'
import { handleDeleteNotification, handleListNotifications, handleMarkNotificationsRead, handleNotificationUnreadCount } from './notification.js'
import { handleAddFavorite, handleAddPlaylistSong, handleCreatePlaylist, handleDeletePlaylist, handleDemotePlaylistSong, handleGetDiscoverPlaylists, handleGetFavorites, handleGetMyPlaylists, handleGetPlaylistDetail, handleGetPlaylistInfo, handlePromotePlaylistSong, handleRemoveFavorite, handleRemovePlaylistSong, handleSearchPlaylists, handleSortPlaylistSongs, handleSubscribePlaylist, handleUnsubscribePlaylist } from './playlist.js'
import { handleSearchMusic, handleSongStreamRedirect } from './search.js'
import { handleCreateShareToken, handleGetPlaylistShareCount, handleGetSongShareCount, handleReportPlaylistShare, handleReportSongShare, handleResolveShareToken } from './share.js'
import { handleGetSongDetail, handleUpsertSong } from './song.js'
import { handleAddSongTag, handleAdminDeleteSongTag, handleAdminDeleteSongTagByName, handleAdminListSongTags, handleDeleteSongTag, handleGetHotSongTags, handleGetSongTags } from './tag.js'
import { handleGetSongThemeColor, handleUpdateSongMeta } from './theme-color.js'
import { handleDeleteUserMessage, handleGetUserMessages, handleReplyUserMessage, handleSendUserMessage } from './user-message.js'
import { handleAutoLogin, handleChangePassword, handleGetPublicUserProfile, handleGetUserProfile, handleRegister, handleRegisterStatus, handleUpdateUserProfile, handleUserLogin } from './user.js'
import { handleAddWish, handleAddWishMessage, handleDeleteWish, handleGetWishMessages, handleGetWishes, handleToggleWishLike } from './wish.js'

export const ROUTES = {
  '/api/user/auto': { POST: handleAutoLogin },
  '/api/user/login': { POST: handleUserLogin },
  '/api/user/profile': { GET: handleGetUserProfile, POST: handleUpdateUserProfile },
  '/api/user/public-profile': { GET: handleGetPublicUserProfile },
  '/api/user/message': { POST: handleSendUserMessage },
  '/api/user/messages': { GET: handleGetUserMessages },
  '/api/user/message/reply': { POST: handleReplyUserMessage },
  '/api/user/message/delete': { POST: handleDeleteUserMessage },
  '/api/admin/message/add': { POST: handleAddAdminMessage },
  '/api/admin/messages': { GET: handleGetAdminMessages },
  '/api/admin/message/detail': { GET: handleAdminMessageDetail },
  '/api/admin/message/delete': { POST: handleDeleteAdminMessage },
  '/api/user/password': { POST: handleChangePassword },
  '/api/user/register': { POST: handleRegister },
  '/api/user/register/status': { GET: handleRegisterStatus },
  '/api/admin/registrations': { GET: handleAdminListRegistrations },
  '/api/admin/registration/review': { POST: handleAdminReviewRegistration },
  '/api/admin/user/vip-level': { POST: handleAdminSetVipLevel },
  '/api/admin/user/vip-records': { GET: handleAdminVipRecords },
  '/api/admin/inbox': { GET: handleAdminInboxList },
  '/api/admin/inbox/reply': { POST: handleAdminReplyMessage },
  '/api/error-log/report': { POST: handleReportErrorLog },
  '/api/admin/error-logs': { GET: handleAdminListErrorLogs },
  '/api/admin/error-log/status': { POST: handleAdminUpdateErrorLogStatus },
  '/api/admin/error-log/delete': { POST: handleAdminDeleteErrorLog },
  '/api/admin/error-log/clear': { POST: handleAdminClearErrorLogs },
  '/api/admin/song-tags': { GET: handleAdminListSongTags },
  '/api/admin/song-tag/delete': { POST: handleAdminDeleteSongTag },
  '/api/admin/song-tag/delete-tag': { POST: handleAdminDeleteSongTagByName },
  '/api/admin/users': { GET: handleAdminListUsers },
  '/api/admin/user/ban': { POST: handleAdminBanUser },
  '/api/admin/user/unban': { POST: handleAdminUnbanUser },
  '/api/admin/user/reset-password': { POST: handleAdminResetPassword },
  '/api/admin/user/delete': { POST: handleAdminDeleteUser },
  '/api/admin/ip-blacklist': { GET: handleAdminListIpBlacklist },
  '/api/admin/ip-blacklist/add': { POST: handleAdminAddIpBlacklist },
  '/api/admin/ip-blacklist/remove': { POST: handleAdminRemoveIpBlacklist },
  '/api/song/add': { POST: handleUpsertSong },
  '/api/recommend/hot': { GET: handleGetHotList },
  '/api/playRecord/list': { GET: handleGetRecentPlay },
  '/api/playRecord/add': { POST: handleAddRecentPlay },
  '/api/playRecord/remove': { POST: handleRemoveRecentPlay },
  '/api/music/search': { GET: handleSearchMusic },
  '/api/song/stream': { GET: handleSongStreamRedirect },
  '/api/favorite/list': { GET: handleGetFavorites },
  '/api/favorite/add': { POST: handleAddFavorite },
  '/api/favorite/remove': { POST: handleRemoveFavorite },
  '/api/playlist/owner': { GET: handleGetMyPlaylists },
  '/api/playlist/create': { POST: handleCreatePlaylist },
  '/api/subPlaylist/create': { POST: handleSubscribePlaylist },
  '/api/playlist/delete': { POST: handleDeletePlaylist },
  '/api/subPlaylist/delete': { POST: handleUnsubscribePlaylist },
  '/api/playlist/detail': { GET: handleGetPlaylistDetail },
  '/api/playlist/add-song': { POST: handleAddPlaylistSong },
  '/api/playlist/sort-song': { POST: handleSortPlaylistSongs },
  '/api/playlist/demote-song': { POST: handleDemotePlaylistSong },
  '/api/playlist/promote-song': { POST: handlePromotePlaylistSong },
  '/api/playlist/remove-song': { POST: handleRemovePlaylistSong },
  '/api/playlist/discover': { GET: handleGetDiscoverPlaylists },
  '/api/playlist/search': { GET: handleSearchPlaylists },
  '/api/playlist/info': { GET: handleGetPlaylistInfo },
  '/api/share/token': { GET: handleCreateShareToken },
  '/api/share/resolve': { GET: handleResolveShareToken },
  '/api/song/detail': { GET: handleGetSongDetail },
  '/api/song/tags': { GET: handleGetHotSongTags },
  '/api/song/tag': { GET: handleGetSongTags, POST: handleAddSongTag },
  '/api/song/tag/delete': { POST: handleDeleteSongTag },
  '/api/song/share': { GET: handleGetSongShareCount, POST: handleReportSongShare },
  '/api/song/comment': { GET: handleGetComments, POST: handleAddComment },
  '/api/song/comment/count': { GET: handleGetCommentCount },
  '/api/song/comment/like': { POST: handleToggleCommentLike },
  '/api/song/comment/delete': { POST: handleDeleteComment },
  '/api/wish/list': { GET: handleGetWishes },
  '/api/wish/add': { POST: handleAddWish },
  '/api/wish/like': { POST: handleToggleWishLike },
  '/api/wish/messages': { GET: handleGetWishMessages },
  '/api/wish/message/add': { POST: handleAddWishMessage },
  '/api/wish/delete': { POST: handleDeleteWish },
  '/api/notification/list': { GET: handleListNotifications },
  '/api/notification/unread': { GET: handleNotificationUnreadCount },
  '/api/notification/read': { POST: handleMarkNotificationsRead },
  '/api/notification/delete': { POST: handleDeleteNotification },
  '/api/playlist/share': { GET: handleGetPlaylistShareCount, POST: handleReportPlaylistShare },
  '/api/song/theme-color': { GET: handleGetSongThemeColor },
  '/api/song/meta': { POST: handleUpdateSongMeta },
}

/** 免 token 白名单：自动登录；播放直链跳转（audio 元素请求无法携带 Authorization 头） */
export const PUBLIC_PATHS = new Set([
  '/api/user/auto',
  '/api/user/login',
  '/api/user/register',
  '/api/user/register/status',
  '/api/song/stream',
  // 错误上报：登录失效（401）时也要能记录，token 有则关联用户、无则匿名
  '/api/error-log/report',
])

/** 已确认存在的用户 id 缓存：userId → 校验时间戳（isolate 内存，5 分钟有效） */
