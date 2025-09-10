import { z } from 'zod';

// User roles enum
export const userRoleSchema = z.enum([
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

export type UserRole = z.infer<typeof userRoleSchema>;

// Request status enum
export const requestStatusSchema = z.enum([
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

export type RequestStatus = z.infer<typeof requestStatusSchema>;

// Priority enum
export const prioritySchema = z.enum(['NORMAL', 'URGENT']);
export type Priority = z.infer<typeof prioritySchema>;

// Action type enum for tracking logs
export const actionTypeSchema = z.enum([
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

export type ActionType = z.infer<typeof actionTypeSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  prodi: z.string().nullable(), // Only relevant for certain roles
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Student schema
export const studentSchema = z.object({
  id: z.number(),
  nim: z.string(),
  name: z.string(),
  prodi: z.string(),
  created_at: z.coerce.date()
});

export type Student = z.infer<typeof studentSchema>;

// Letter request schema
export const letterRequestSchema = z.object({
  id: z.number(),
  student_id: z.number(),
  created_by_user_id: z.number(),
  letter_type: z.string(),
  purpose: z.string(),
  priority: prioritySchema,
  status: requestStatusSchema,
  current_handler_user_id: z.number().nullable(),
  dekan_instructions: z.string().nullable(),
  final_letter_url: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type LetterRequest = z.infer<typeof letterRequestSchema>;

// Supporting documents schema
export const supportingDocumentSchema = z.object({
  id: z.number(),
  letter_request_id: z.number(),
  file_name: z.string(),
  file_url: z.string(),
  uploaded_by_user_id: z.number(),
  created_at: z.coerce.date()
});

export type SupportingDocument = z.infer<typeof supportingDocumentSchema>;

// Tracking log schema
export const trackingLogSchema = z.object({
  id: z.number(),
  letter_request_id: z.number(),
  user_id: z.number(),
  action_type: actionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  previous_status: requestStatusSchema.nullable(),
  new_status: requestStatusSchema.nullable(),
  created_at: z.coerce.date()
});

export type TrackingLog = z.infer<typeof trackingLogSchema>;

// Disposition assignments schema
export const dispositionAssignmentSchema = z.object({
  id: z.number(),
  letter_request_id: z.number(),
  assigned_to_user_id: z.number(),
  assigned_by_user_id: z.number(),
  instructions: z.string(),
  order_sequence: z.number().int(),
  is_completed: z.boolean(),
  completed_at: z.coerce.date().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date()
});

export type DispositionAssignment = z.infer<typeof dispositionAssignmentSchema>;

// Input schemas for creating/updating

// Create user input
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  prodi: z.string().nullable().optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Create student input
export const createStudentInputSchema = z.object({
  nim: z.string(),
  name: z.string(),
  prodi: z.string()
});

export type CreateStudentInput = z.infer<typeof createStudentInputSchema>;

// Create letter request input
export const createLetterRequestInputSchema = z.object({
  student_id: z.number(),
  letter_type: z.string(),
  purpose: z.string(),
  priority: prioritySchema,
  supporting_documents: z.array(z.object({
    file_name: z.string(),
    file_url: z.string()
  })).optional()
});

export type CreateLetterRequestInput = z.infer<typeof createLetterRequestInputSchema>;

// Update letter request status input
export const updateRequestStatusInputSchema = z.object({
  request_id: z.number(),
  new_status: requestStatusSchema,
  notes: z.string().optional(),
  next_handler_user_id: z.number().optional()
});

export type UpdateRequestStatusInput = z.infer<typeof updateRequestStatusInputSchema>;

// Create disposition input
export const createDispositionInputSchema = z.object({
  request_id: z.number(),
  instructions: z.string(),
  assignments: z.array(z.object({
    user_id: z.number(),
    order_sequence: z.number().int()
  }))
});

export type CreateDispositionInput = z.infer<typeof createDispositionInputSchema>;

// Process disposition input
export const processDispositionInputSchema = z.object({
  assignment_id: z.number(),
  notes: z.string().optional(),
  escalate: z.boolean().optional(),
  flag_for_coordination: z.boolean().optional()
});

export type ProcessDispositionInput = z.infer<typeof processDispositionInputSchema>;

// Upload final letter input
export const uploadFinalLetterInputSchema = z.object({
  request_id: z.number(),
  file_url: z.string()
});

export type UploadFinalLetterInput = z.infer<typeof uploadFinalLetterInputSchema>;

// Sign letter input
export const signLetterInputSchema = z.object({
  request_id: z.number(),
  signature_data: z.string() // Could be digital signature hash or similar
});

export type SignLetterInput = z.infer<typeof signLetterInputSchema>;

// Add tracking log input
export const addTrackingLogInputSchema = z.object({
  request_id: z.number(),
  action_type: actionTypeSchema,
  description: z.string(),
  notes: z.string().optional(),
  previous_status: requestStatusSchema.optional(),
  new_status: requestStatusSchema.optional()
});

export type AddTrackingLogInput = z.infer<typeof addTrackingLogInputSchema>;

// Get requests filter input
export const getRequestsFilterSchema = z.object({
  status: requestStatusSchema.optional(),
  priority: prioritySchema.optional(),
  student_nim: z.string().optional(),
  created_by_user_id: z.number().optional(),
  current_handler_user_id: z.number().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional()
});

export type GetRequestsFilter = z.infer<typeof getRequestsFilterSchema>;