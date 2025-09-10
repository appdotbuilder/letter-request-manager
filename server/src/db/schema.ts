import { serial, text, pgTable, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', [
  'STUDENT',
  'STAFF_PRODI', 
  'KAPRODI',
  'STAFF_FAKULTAS',
  'DEKAN',
  'WD1',
  'WD2', 
  'WD3',
  'KABAG_TU',
  'KAUR_AKADEMIK',
  'KAUR_KEMAHASISWAAN',
  'KAUR_KEUANGAN',
  'ADMIN'
]);

export const requestStatusEnum = pgEnum('request_status', [
  'DRAFT',
  'APPROVED_KAPRODI',
  'FORWARDED_TO_DEKAN', 
  'DISPOSISI_TO_WD1',
  'DISPOSISI_TO_WD2',
  'DISPOSISI_TO_WD3',
  'DISPOSISI_TO_KABAG_TU',
  'DISPOSISI_TO_KAUR_AKADEMIK',
  'DISPOSISI_TO_KAUR_KEMAHASISWAAN',
  'DISPOSISI_TO_KAUR_KEUANGAN',
  'PROCESSED_BY_WD1',
  'PROCESSED_BY_WD2',
  'PROCESSED_BY_WD3',
  'PROCESSED_BY_KABAG_TU',
  'PROCESSED_BY_KAUR_AKADEMIK',
  'PROCESSED_BY_KAUR_KEMAHASISWAAN',
  'PROCESSED_BY_KAUR_KEUANGAN',
  'TTD_READY',
  'TTD_DONE',
  'RETURNED_TO_PRODI',
  'PRINTED',
  'DELIVERED',
  'ARCHIVED',
  'REJECTED',
  'ESCALATED'
]);

export const priorityEnum = pgEnum('priority', ['NORMAL', 'URGENT']);

export const actionTypeEnum = pgEnum('action_type', [
  'CREATED',
  'APPROVED',
  'REJECTED', 
  'FORWARDED',
  'DISPOSISI_ASSIGNED',
  'PROCESSED',
  'ESCALATED',
  'SIGNED',
  'RETURNED',
  'PRINTED',
  'DELIVERED',
  'ARCHIVED',
  'NOTE_ADDED',
  'DOCUMENT_UPLOADED'
]);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull(),
  prodi: text('prodi'), // Nullable for roles that don't need prodi
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Students table
export const studentsTable = pgTable('students', {
  id: serial('id').primaryKey(),
  nim: text('nim').unique().notNull(),
  name: text('name').notNull(),
  prodi: text('prodi').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Letter requests table
export const letterRequestsTable = pgTable('letter_requests', {
  id: serial('id').primaryKey(),
  student_id: integer('student_id').references(() => studentsTable.id).notNull(),
  created_by_user_id: integer('created_by_user_id').references(() => usersTable.id).notNull(),
  letter_type: text('letter_type').notNull(),
  purpose: text('purpose').notNull(),
  priority: priorityEnum('priority').notNull(),
  status: requestStatusEnum('status').notNull(),
  current_handler_user_id: integer('current_handler_user_id').references(() => usersTable.id),
  dekan_instructions: text('dekan_instructions'),
  final_letter_url: text('final_letter_url'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Supporting documents table
export const supportingDocumentsTable = pgTable('supporting_documents', {
  id: serial('id').primaryKey(),
  letter_request_id: integer('letter_request_id').references(() => letterRequestsTable.id).notNull(),
  file_name: text('file_name').notNull(),
  file_url: text('file_url').notNull(),
  uploaded_by_user_id: integer('uploaded_by_user_id').references(() => usersTable.id).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Tracking logs table
export const trackingLogsTable = pgTable('tracking_logs', {
  id: serial('id').primaryKey(),
  letter_request_id: integer('letter_request_id').references(() => letterRequestsTable.id).notNull(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  action_type: actionTypeEnum('action_type').notNull(),
  description: text('description').notNull(),
  notes: text('notes'),
  previous_status: requestStatusEnum('previous_status'),
  new_status: requestStatusEnum('new_status'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Disposition assignments table
export const dispositionAssignmentsTable = pgTable('disposition_assignments', {
  id: serial('id').primaryKey(),
  letter_request_id: integer('letter_request_id').references(() => letterRequestsTable.id).notNull(),
  assigned_to_user_id: integer('assigned_to_user_id').references(() => usersTable.id).notNull(),
  assigned_by_user_id: integer('assigned_by_user_id').references(() => usersTable.id).notNull(),
  instructions: text('instructions').notNull(),
  order_sequence: integer('order_sequence').notNull(),
  is_completed: boolean('is_completed').default(false).notNull(),
  completed_at: timestamp('completed_at'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdRequests: many(letterRequestsTable, { relationName: 'createdBy' }),
  currentlyHandling: many(letterRequestsTable, { relationName: 'currentHandler' }),
  trackingLogs: many(trackingLogsTable),
  uploadedDocuments: many(supportingDocumentsTable),
  assignedDispositions: many(dispositionAssignmentsTable, { relationName: 'assignedTo' }),
  createdDispositions: many(dispositionAssignmentsTable, { relationName: 'assignedBy' })
}));

export const studentsRelations = relations(studentsTable, ({ many }) => ({
  letterRequests: many(letterRequestsTable)
}));

export const letterRequestsRelations = relations(letterRequestsTable, ({ one, many }) => ({
  student: one(studentsTable, {
    fields: [letterRequestsTable.student_id],
    references: [studentsTable.id]
  }),
  createdBy: one(usersTable, {
    fields: [letterRequestsTable.created_by_user_id],
    references: [usersTable.id],
    relationName: 'createdBy'
  }),
  currentHandler: one(usersTable, {
    fields: [letterRequestsTable.current_handler_user_id],
    references: [usersTable.id],
    relationName: 'currentHandler'
  }),
  supportingDocuments: many(supportingDocumentsTable),
  trackingLogs: many(trackingLogsTable),
  dispositionAssignments: many(dispositionAssignmentsTable)
}));

export const supportingDocumentsRelations = relations(supportingDocumentsTable, ({ one }) => ({
  letterRequest: one(letterRequestsTable, {
    fields: [supportingDocumentsTable.letter_request_id],
    references: [letterRequestsTable.id]
  }),
  uploadedBy: one(usersTable, {
    fields: [supportingDocumentsTable.uploaded_by_user_id],
    references: [usersTable.id]
  })
}));

export const trackingLogsRelations = relations(trackingLogsTable, ({ one }) => ({
  letterRequest: one(letterRequestsTable, {
    fields: [trackingLogsTable.letter_request_id],
    references: [letterRequestsTable.id]
  }),
  user: one(usersTable, {
    fields: [trackingLogsTable.user_id],
    references: [usersTable.id]
  })
}));

export const dispositionAssignmentsRelations = relations(dispositionAssignmentsTable, ({ one }) => ({
  letterRequest: one(letterRequestsTable, {
    fields: [dispositionAssignmentsTable.letter_request_id],
    references: [letterRequestsTable.id]
  }),
  assignedTo: one(usersTable, {
    fields: [dispositionAssignmentsTable.assigned_to_user_id],
    references: [usersTable.id],
    relationName: 'assignedTo'
  }),
  assignedBy: one(usersTable, {
    fields: [dispositionAssignmentsTable.assigned_by_user_id],
    references: [usersTable.id],
    relationName: 'assignedBy'
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Student = typeof studentsTable.$inferSelect;
export type NewStudent = typeof studentsTable.$inferInsert;

export type LetterRequest = typeof letterRequestsTable.$inferSelect;
export type NewLetterRequest = typeof letterRequestsTable.$inferInsert;

export type SupportingDocument = typeof supportingDocumentsTable.$inferSelect;
export type NewSupportingDocument = typeof supportingDocumentsTable.$inferInsert;

export type TrackingLog = typeof trackingLogsTable.$inferSelect;
export type NewTrackingLog = typeof trackingLogsTable.$inferInsert;

export type DispositionAssignment = typeof dispositionAssignmentsTable.$inferSelect;
export type NewDispositionAssignment = typeof dispositionAssignmentsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  students: studentsTable,
  letterRequests: letterRequestsTable,
  supportingDocuments: supportingDocumentsTable,
  trackingLogs: trackingLogsTable,
  dispositionAssignments: dispositionAssignmentsTable
};