export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  AUTH_DEVICE_APPROVAL_REQUIRED: 'AUTH_DEVICE_APPROVAL_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SHOP_ACCESS_DENIED: 'SHOP_ACCESS_DENIED',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_ARCHIVED: 'PRODUCT_ARCHIVED',
  BARCODE_ALREADY_EXISTS: 'BARCODE_ALREADY_EXISTS',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  SALE_NOT_FOUND: 'SALE_NOT_FOUND',
  SALE_ALREADY_VOIDED: 'SALE_ALREADY_VOIDED',
  RETURN_NOT_FOUND: 'RETURN_NOT_FOUND',
  RETURN_NOT_APPROVED: 'RETURN_NOT_APPROVED',
  RETURN_QUANTITY_INVALID: 'RETURN_QUANTITY_INVALID',
  REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
  EXCHANGE_NOT_ALLOWED: 'EXCHANGE_NOT_ALLOWED',
  TRANSFER_INVALID_STATE: 'TRANSFER_INVALID_STATE',
  CURRENCY_RATE_NOT_SET: 'CURRENCY_RATE_NOT_SET',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const PERMISSIONS = {
  'products.view': 'products.view',
  'products.create': 'products.create',
  'products.update': 'products.update',
  'products.delete': 'products.delete',
  'products.archive': 'products.archive',
  'categories.manage': 'categories.manage',
  'brands.manage': 'brands.manage',
  'suppliers.manage': 'suppliers.manage',
  'inventory.view': 'inventory.view',
  'inventory.add': 'inventory.add',
  'inventory.adjust': 'inventory.adjust',
  'inventory.transfer.request': 'inventory.transfer.request',
  'inventory.transfer.approve': 'inventory.transfer.approve',
  'inventory.transfer.dispatch': 'inventory.transfer.dispatch',
  'inventory.transfer.receive': 'inventory.transfer.receive',
  'purchases.view': 'purchases.view',
  'purchases.create': 'purchases.create',
  'sales.create': 'sales.create',
  'sales.view': 'sales.view',
  'sales.view.own_shop': 'sales.view.own_shop',
  'sales.void': 'sales.void',
  'returns.create': 'returns.create',
  'returns.view': 'returns.view',
  'returns.approve': 'returns.approve',
  'returns.reject': 'returns.reject',
  'refunds.process': 'refunds.process',
  'exchanges.process': 'exchanges.process',
  'customers.manage': 'customers.manage',
  'payments.view': 'payments.view',
  'payments.configure': 'payments.configure',
  'reports.view': 'reports.view',
  'reports.export': 'reports.export',
  'expenses.manage': 'expenses.manage',
  'users.manage': 'users.manage',
  'shops.manage': 'shops.manage',
  'settings.manage': 'settings.manage',
  'audit.view': 'audit.view',
  'security.manage': 'security.manage',
  'backup.manage': 'backup.manage',
  'notifications.manage': 'notifications.manage',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const SHOP_USER_PERMISSIONS: PermissionKey[] = [
  'sales.create',
  'sales.view.own_shop',
  'inventory.view',
  'returns.create',
  'customers.manage',
  'notifications.manage',
];

export const POS_SHORTCUTS = {
  focusSearch: '/',
  addScannedItem: 'Enter',
  removeLineItem: 'Delete',
  completeSale: 'F2',
  printReceipt: 'F4',
  newTransaction: 'F9',
  clearCart: 'Escape',
} as const;

export type CurrencyCode = 'BDT' | 'GBP';
