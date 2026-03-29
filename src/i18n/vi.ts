export const vi = {
  // ─── Common ─────────────────────────────────────────────────────────────────
  common: {
    serverError: 'Lỗi server',
    forbidden: 'Bạn không có quyền thực hiện thao tác này',
  },

  // ─── Auth ───────────────────────────────────────────────────────────────────
  auth: {
    invalidCredentials: 'Số điện thoại hoặc mật khẩu không đúng',
    invalidToken: 'Token không hợp lệ',
    invalidRefreshToken: 'Refresh token không hợp lệ',
    expiredRefreshToken: 'Refresh token không hợp lệ hoặc đã hết hạn',
    accountDisabled: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa',
    loginSuccess: 'Đăng nhập thành công',
    registerSuccess: 'Đăng ký thành công',
    invalidRole: 'Role không hợp lệ. Chỉ chấp nhận STAFF hoặc CUSTOMER',
    phoneDuplicate: 'Số điện thoại đã được đăng ký',
    emailDuplicate: 'Email đã được sử dụng',
    googleTokenInvalid: 'Google token không hợp lệ',
    googleRoleRequired: 'Vui lòng chọn role khi đăng ký lần đầu bằng Google',
    forgotPasswordSuccess: 'Đã gửi mã xác nhận',
    resetPasswordSuccess: 'Đặt lại mật khẩu thành công',
    resetTokenInvalid: 'Token đặt lại mật khẩu không hợp lệ',
    refreshSuccess: 'Refresh token thành công',
    logoutSuccess: 'Đăng xuất thành công',
    profileSuccess: 'Lấy thông tin thành công',
    changePasswordSuccess: 'Đổi mật khẩu thành công',
    currentPasswordIncorrect: 'Mật khẩu hiện tại không đúng',
  },

  // ─── API Key ─────────────────────────────────────────────────────────────────
  apiKey: {
    missing: 'API key bị thiếu',
    invalid: 'API key không hợp lệ',
  },

  // ─── Users ───────────────────────────────────────────────────────────────────
  users: {
    notFound: 'Người dùng không tồn tại',
    phoneDuplicate: 'Số điện thoại đã được sử dụng',
    cannotDeleteSelf: 'Không thể xoá tài khoản của chính mình',
    adminNotFound: 'Không tìm thấy admin',
    listSuccess: 'Lấy danh sách người dùng thành công',
    getSuccess: 'Lấy thông tin người dùng thành công',
    createSuccess: 'Tạo người dùng thành công',
    updateSuccess: 'Cập nhật người dùng thành công',
    disableSuccess: 'Vô hiệu hóa người dùng thành công',
  },

  // ─── Properties ──────────────────────────────────────────────────────────────
  properties: {
    notFound: 'Cơ sở không tồn tại',
    ownerNotFound: 'Chủ cơ sở không tồn tại',
    forbidden: 'Bạn không có quyền truy cập cơ sở này',
    listSuccess: 'Lấy danh sách cơ sở thành công',
    getSuccess: 'Lấy thông tin cơ sở thành công',
    createSuccess: 'Tạo cơ sở thành công',
    updateSuccess: 'Cập nhật cơ sở thành công',
    deleteSuccess: 'Xoá cơ sở thành công',
  },

  // ─── Rooms ───────────────────────────────────────────────────────────────────
  rooms: {
    notFound: 'Phòng không tồn tại',
    codeDuplicate: 'Mã phòng đã tồn tại',
    imageNotFound: 'Ảnh không tồn tại',
    maxImages: (max: number) => `Tối đa ${max} ảnh mỗi phòng`,
    uploadSuccess: (count: number) => `Upload ${count} ảnh thành công`,
    forbiddenAdd: 'Bạn không có quyền thêm phòng vào cơ sở này',
    forbidden: 'Bạn không có quyền thao tác phòng này',
    listSuccess: 'Lấy danh sách phòng thành công',
    publicListSuccess: 'Lấy danh sách phòng công khai thành công',
    getSuccess: 'Lấy thông tin phòng thành công',
    createSuccess: 'Tạo phòng thành công',
    updateSuccess: 'Cập nhật phòng thành công',
    deleteSuccess: 'Xoá phòng thành công',
    deleteImageSuccess: 'Xoá ảnh thành công',
    setCoverSuccess: 'Đặt ảnh cover thành công',
    calendarSuccess: 'Lấy lịch phòng thành công',
  },

  // ─── Prices ──────────────────────────────────────────────────────────────────
  prices: {
    notFound: 'Chưa có giá cho phòng này',
    forbidden: 'Bạn không có quyền cập nhật giá phòng này',
    getSuccess: 'Lấy giá phòng thành công',
    upsertSuccess: 'Cập nhật giá phòng thành công',
  },

  // ─── Bookings ────────────────────────────────────────────────────────────────
  bookings: {
    notFound: 'Booking không tồn tại',
    checkoutBeforeCheckin: 'Ngày check-out phải sau ngày check-in',
    checkinInPast: 'Ngày check-in không thể trong quá khứ',
    roomAlreadyBooked: 'Phòng đã được đặt trong khoảng thời gian này',
    roomOnHold: (minutes: number) => `Phòng đang được giữ, còn ${minutes} phút nữa sẽ tự động huỷ`,
    onlyConfirmHold: 'Chỉ có thể xác nhận booking đang ở trạng thái HOLD',
    alreadyCancelled: 'Booking đã bị huỷ trước đó',
    forbiddenConfirm: 'Bạn không có quyền xác nhận booking này',
    forbiddenAccess: 'Bạn không có quyền truy cập booking này',
    forbidden: 'Bạn không có quyền thực hiện thao tác này',
    listSuccess: 'Lấy danh sách booking thành công',
    getSuccess: 'Lấy thông tin booking thành công',
    holdSuccess: 'Giữ phòng thành công (30 phút)',
    customerHoldSuccess: 'Đặt phòng thành công, chờ xác nhận trong 24 giờ',
    myListSuccess: 'Lấy danh sách booking của bạn thành công',
    customerCancelSuccess: 'Đã huỷ đặt phòng',
    cannotCancelConfirmed: 'Không thể huỷ booking đã xác nhận, vui lòng liên hệ nhân viên',
    notYourBooking: 'Booking này không thuộc về bạn',
    onlyCancelHold: 'Chỉ có thể huỷ booking đang ở trạng thái HOLD',
    roomNotAvailable: 'Phòng đã được đặt trong khoảng thời gian này',
    confirmSuccess: 'Xác nhận booking thành công',
    cancelSuccess: 'Huỷ booking thành công',
    updateSuccess: 'Cập nhật booking thành công',
  },

  // ─── Partner ─────────────────────────────────────────────────────────────────
  partner: {
    listSuccess: 'Lấy danh sách phòng thành công',
    getSuccess: 'Lấy thông tin phòng thành công',
    availabilitySuccess: 'Lấy lịch trống thành công',
    bookingSuccess: 'Tạo booking thành công, chờ xác nhận',
    cancelSuccess: 'Huỷ booking thành công',
  },

  // ─── Calendar ───────────────────────────────────────────────────────────────
  calendar: {
    propertyGroupsSuccess: 'Lấy danh sách nhóm property thành công',
    gridSuccess: 'Lấy dữ liệu lịch thành công',
    lockSuccess: 'Khoá phòng thành công',
    unlockSuccess: 'Mở khoá phòng thành công',
    adminContactSuccess: 'Lấy thông tin liên hệ admin thành công',
    cannotUnlockBooked: 'Không thể mở khoá ngày đã được đặt, chỉ có thể mở khoá ngày đang giữ',
    dateAlreadyBooked: 'Ngày này đã được đặt hoặc đang giữ',
    roomNotFound: 'Phòng không tồn tại',
  },

  // ─── Notifications ──────────────────────────────────────────────────────────
  notifications: {
    listSuccess: 'Lấy danh sách thông báo thành công',
    unreadCountSuccess: 'Lấy số thông báo chưa đọc thành công',
    markReadSuccess: 'Đánh dấu đã đọc thành công',
    markAllReadSuccess: 'Đánh dấu tất cả đã đọc thành công',
    notFound: 'Thông báo không tồn tại',
  },

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: {
    statsSuccess: 'Lấy thống kê dashboard thành công',
    reportsSuccess: 'Lấy dữ liệu báo cáo thành công',
  },
};
