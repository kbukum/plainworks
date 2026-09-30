// Every paginated list the showcase reads, declared once. Each is shared by the SSR prefetch and
// the client query, and every page is validated against the list envelope and the row guard before
// it is trusted. Neutral and server-safe: it names no host global.

import type { Notification, Order, Product, Task, User } from "@plainworks/demo"
import { httpListQuery } from "@plainworks/query/http-list"
import {
  NOTIFICATIONS_RESOURCE,
  ORDERS_RESOURCE,
  PRODUCTS_RESOURCE,
  TASKS_RESOURCE,
  USERS_RESOURCE,
} from "./constants"
import { isNotification } from "./notification-shape"
import { isOrder } from "./order-shape"
import { isProduct } from "./product-shape"
import { isTask } from "./task-shape"
import { isUser } from "./user-shape"

/** The task list: `.read` for one validated page, `.options` for the query plan. */
export const taskList = httpListQuery<Task>({
  path: "/api/tasks",
  resource: TASKS_RESOURCE,
  row: isTask,
})

/** The user list: `.read` for one validated page, `.options` for the query plan. */
export const userList = httpListQuery<User>({
  path: "/api/users",
  resource: USERS_RESOURCE,
  row: isUser,
})

/** The product list: `.read` for one validated page, `.options` for the query plan. */
export const productList = httpListQuery<Product>({
  path: "/api/products",
  resource: PRODUCTS_RESOURCE,
  row: isProduct,
})

/** The order list: `.read` for one validated page, `.options` for the query plan. */
export const orderList = httpListQuery<Order>({
  path: "/api/orders",
  resource: ORDERS_RESOURCE,
  row: isOrder,
})

/** The notification list: `.read` for one validated page, `.options` for the query plan. */
export const notificationList = httpListQuery<Notification>({
  path: "/api/notifications",
  resource: NOTIFICATIONS_RESOURCE,
  row: isNotification,
})
