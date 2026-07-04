import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';

// 1. 用户表（预留扩展）
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. 项目表（存储用户生成的每个应用/项目）
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  // 存储项目生成的核心代码，JSON 格式便于扩展
  codeSnapshot: jsonb('code_snapshot'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. 消息表（存储每个项目下的对话历史）
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 导出所有表
export const schema = {
  users,
  projects,
  messages,
};
