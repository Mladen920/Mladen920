# Firestore Security Specification

## 1. Access Control Model
- **Default Deny**: All paths not explicitly matched are denied (`allow read, write: if false;`).
- **Authentication**: Requires signed-in Firebase user (`request.auth != null`).
- **Admin Role**:
  - Bootstrapped for primary owner `mladjo_992@hotmail.com` when `request.auth.token.email_verified == true`.
  - Also granted to users with a document at `/users/$(request.auth.uid)` where `role == 'admin'`.
- **Worker / Authenticated User**:
  - Signed-in users can read work orders, materials, consumption logs, and deleted records.
  - Admins can create, update, and delete users, work orders, materials, consumption logs, and tombstones.

## 2. Collections & Validation Rules
- **`/users/{userId}`**:
  - `get`, `list`: Signed-in user (own profile) or Admin.
  - `create`, `update`: Admin (or self-create as `worker`), strict schema & size constraints.
  - `delete`: Admin only.
- **`/workOrders/{orderId}`**:
  - `get`, `list`: Signed-in user.
  - `create`, `update`: Signed-in user with valid schema (`id`, `orderNumber`, `clientName`, `status`, `createdAt`, `createdBy`) and bounded string lengths.
  - `delete`: Admin only.
- **`/materials/{materialId}`**:
  - `get`, `list`: Signed-in user.
  - `create`, `update`: Signed-in user with valid schema (`id`, `name`, `type`, `unit`, `stock`, `minStock`) and non-negative numeric values.
  - `delete`: Admin only.
- **`/consumptionLogs/{logId}`**:
  - `get`, `list`: Signed-in user.
  - `create`, `update`: Signed-in user with valid schema (`id`, `workOrderId`, `workerId`, `materialId`, `quantity`, `date`).
  - `delete`: Admin only.
- **`/deletedRecords/{recordId}`**:
  - `get`, `list`: Signed-in user.
  - `create`, `update`: Admin only with valid tombstone schema (`id`, `entityType`, `deletedAt`).
  - `delete`: Admin only.
