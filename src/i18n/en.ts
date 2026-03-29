export const en = {
  // ─── Common ─────────────────────────────────────────────────────────────────
  common: {
    serverError: 'Internal server error',
    forbidden: 'You do not have permission to perform this action',
  },

  // ─── Auth ───────────────────────────────────────────────────────────────────
  auth: {
    invalidCredentials: 'Phone number or password is incorrect',
    invalidToken: 'Invalid token',
    invalidRefreshToken: 'Invalid refresh token',
    expiredRefreshToken: 'Refresh token is invalid or expired',
    accountDisabled: 'Account does not exist or has been disabled',
    loginSuccess: 'Login successful',
    registerSuccess: 'Registration successful',
    invalidRole: 'Invalid role. Only STAFF or CUSTOMER are accepted',
    phoneDuplicate: 'Phone number is already registered',
    emailDuplicate: 'Email is already in use',
    googleTokenInvalid: 'Invalid Google token',
    googleRoleRequired: 'Please select a role when signing up with Google for the first time',
    forgotPasswordSuccess: 'Verification code sent',
    resetPasswordSuccess: 'Password reset successful',
    resetTokenInvalid: 'Invalid reset token',
    refreshSuccess: 'Token refreshed successfully',
    logoutSuccess: 'Logout successful',
    profileSuccess: 'Profile retrieved successfully',
    changePasswordSuccess: 'Password changed successfully',
    currentPasswordIncorrect: 'Current password is incorrect',
  },

  // ─── API Key ─────────────────────────────────────────────────────────────────
  apiKey: {
    missing: 'API key is missing',
    invalid: 'Invalid API key',
  },

  // ─── Users ───────────────────────────────────────────────────────────────────
  users: {
    notFound: 'User not found',
    phoneDuplicate: 'Phone number is already in use',
    cannotDeleteSelf: 'Cannot delete your own account',
    adminNotFound: 'Admin not found',
    listSuccess: 'User list retrieved successfully',
    getSuccess: 'User retrieved successfully',
    createSuccess: 'User created successfully',
    updateSuccess: 'User updated successfully',
    disableSuccess: 'User disabled successfully',
  },

  // ─── Propertys ───────────────────────────────────────────────────────────────
  properties: {
    notFound: 'Property not found',
    ownerNotFound: 'Owner not found',
    forbidden: 'You do not have access to this property',
    listSuccess: 'Property list retrieved successfully',
    getSuccess: 'Property retrieved successfully',
    createSuccess: 'Property created successfully',
    updateSuccess: 'Property updated successfully',
    deleteSuccess: 'Property deleted successfully',
  },

  // ─── Rooms ───────────────────────────────────────────────────────────────────
  rooms: {
    notFound: 'Room not found',
    codeDuplicate: 'Room code already exists',
    imageNotFound: 'Image not found',
    maxImages: (max: number) => `Maximum ${max} images per room`,
    uploadSuccess: (count: number) => `${count} image(s) uploaded successfully`,
    forbiddenAdd: 'You do not have permission to add rooms to this property',
    forbidden: 'You do not have permission to manage this room',
    listSuccess: 'Room list retrieved successfully',
    publicListSuccess: 'Public room list retrieved successfully',
    getSuccess: 'Room retrieved successfully',
    createSuccess: 'Room created successfully',
    updateSuccess: 'Room updated successfully',
    deleteSuccess: 'Room deleted successfully',
    deleteImageSuccess: 'Image deleted successfully',
    setCoverSuccess: 'Cover image set successfully',
    calendarSuccess: 'Room calendar retrieved successfully',
  },

  // ─── Prices ──────────────────────────────────────────────────────────────────
  prices: {
    notFound: 'No price set for this room',
    forbidden: 'You do not have permission to update the price for this room',
    getSuccess: 'Room price retrieved successfully',
    upsertSuccess: 'Room price updated successfully',
  },

  // ─── Bookings ────────────────────────────────────────────────────────────────
  bookings: {
    notFound: 'Booking not found',
    checkoutBeforeCheckin: 'Check-out date must be after check-in date',
    checkinInPast: 'Check-in date cannot be in the past',
    roomAlreadyBooked: 'Room is already booked for this period',
    roomOnHold: (minutes: number) => `Room is currently on hold, will be released in ${minutes} minute(s)`,
    onlyConfirmHold: 'Only bookings with HOLD status can be confirmed',
    alreadyCancelled: 'Booking has already been cancelled',
    forbiddenConfirm: 'You do not have permission to confirm this booking',
    forbiddenAccess: 'You do not have permission to access this booking',
    forbidden: 'You do not have permission to perform this action',
    listSuccess: 'Booking list retrieved successfully',
    getSuccess: 'Booking retrieved successfully',
    holdSuccess: 'Room held successfully (30 minutes)',
    customerHoldSuccess: 'Room booked successfully, awaiting confirmation within 24 hours',
    myListSuccess: 'Your bookings retrieved successfully',
    customerCancelSuccess: 'Booking cancelled successfully',
    cannotCancelConfirmed: 'Cannot cancel a confirmed booking, please contact staff',
    notYourBooking: 'This booking does not belong to you',
    onlyCancelHold: 'Only bookings with HOLD status can be cancelled',
    roomNotAvailable: 'Room is not available for the selected dates',
    confirmSuccess: 'Booking confirmed successfully',
    cancelSuccess: 'Booking cancelled successfully',
    updateSuccess: 'Booking updated successfully',
  },

  // ─── Partner ─────────────────────────────────────────────────────────────────
  partner: {
    listSuccess: 'Room list retrieved successfully',
    getSuccess: 'Room retrieved successfully',
    availabilitySuccess: 'Availability retrieved successfully',
    bookingSuccess: 'Booking created successfully, awaiting confirmation',
    cancelSuccess: 'Booking cancelled successfully',
  },

  // ─── Calendar ───────────────────────────────────────────────────────────────
  calendar: {
    propertyGroupsSuccess: 'Property groups retrieved successfully',
    gridSuccess: 'Calendar grid retrieved successfully',
    lockSuccess: 'Room locked successfully',
    unlockSuccess: 'Room unlocked successfully',
    adminContactSuccess: 'Admin contact retrieved successfully',
    cannotUnlockBooked: 'Cannot unlock a booked date, only held dates can be unlocked',
    dateAlreadyBooked: 'This date is already booked or held',
    roomNotFound: 'Room not found',
  },

  // ─── Notifications ──────────────────────────────────────────────────────────
  notifications: {
    listSuccess: 'Notifications retrieved successfully',
    unreadCountSuccess: 'Unread count retrieved successfully',
    markReadSuccess: 'Notification marked as read',
    markAllReadSuccess: 'All notifications marked as read',
    notFound: 'Notification not found',
  },

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: {
    statsSuccess: 'Dashboard stats retrieved successfully',
    reportsSuccess: 'Report data retrieved successfully',
  },
};
