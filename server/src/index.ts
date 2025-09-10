import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  createStudentInputSchema,
  createLetterRequestInputSchema,
  updateRequestStatusInputSchema,
  createDispositionInputSchema,
  processDispositionInputSchema,
  uploadFinalLetterInputSchema,
  signLetterInputSchema,
  addTrackingLogInputSchema,
  getRequestsFilterSchema,
  userRoleSchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { createStudent } from './handlers/create_student';
import { createLetterRequest } from './handlers/create_letter_request';
import { updateRequestStatus } from './handlers/update_request_status';
import { createDisposition } from './handlers/create_disposition';
import { processDisposition } from './handlers/process_disposition';
import { uploadFinalLetter } from './handlers/upload_final_letter';
import { signLetter } from './handlers/sign_letter';
import { getRequests } from './handlers/get_requests';
import { getRequestById } from './handlers/get_request_by_id';
import { getTrackingLogs } from './handlers/get_tracking_logs';
import { addTrackingLog } from './handlers/add_tracking_log';
import { getDispositionAssignments } from './handlers/get_disposition_assignments';
import { getUsersByRole } from './handlers/get_users_by_role';
import { getStudents } from './handlers/get_students';
import { uploadSupportingDocument } from './handlers/upload_supporting_document';
import { getSupportingDocuments } from './handlers/get_supporting_documents';
import { getUserById } from './handlers/get_user_by_id';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Main application router
const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUserById: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserById(input.userId)),

  getUsersByRole: publicProcedure
    .input(z.object({ role: userRoleSchema }))
    .query(({ input }) => getUsersByRole(input.role)),

  // Student management
  createStudent: publicProcedure
    .input(createStudentInputSchema)
    .mutation(({ input }) => createStudent(input)),

  getStudents: publicProcedure
    .input(z.object({ searchTerm: z.string().optional() }).optional())
    .query(({ input }) => getStudents(input?.searchTerm)),

  // Letter request lifecycle
  createLetterRequest: publicProcedure
    .input(createLetterRequestInputSchema.extend({
      userId: z.number() // Current user creating the request
    }))
    .mutation(({ input }) => {
      const { userId, ...requestInput } = input;
      return createLetterRequest(requestInput, userId);
    }),

  updateRequestStatus: publicProcedure
    .input(updateRequestStatusInputSchema.extend({
      userId: z.number() // Current user making the update
    }))
    .mutation(({ input }) => {
      const { userId, ...statusInput } = input;
      return updateRequestStatus(statusInput, userId);
    }),

  getRequests: publicProcedure
    .input(z.object({
      filter: getRequestsFilterSchema.optional(),
      userId: z.number().optional()
    }).optional())
    .query(({ input }) => getRequests(input?.filter, input?.userId)),

  getRequestById: publicProcedure
    .input(z.object({
      requestId: z.number(),
      userId: z.number().optional()
    }))
    .query(({ input }) => getRequestById(input.requestId, input.userId)),

  // Disposition management (Dean workflow)
  createDisposition: publicProcedure
    .input(createDispositionInputSchema.extend({
      dekanUserId: z.number() // Current Dean user
    }))
    .mutation(({ input }) => {
      const { dekanUserId, ...dispositionInput } = input;
      return createDisposition(dispositionInput, dekanUserId);
    }),

  processDisposition: publicProcedure
    .input(processDispositionInputSchema.extend({
      userId: z.number() // Current officer processing
    }))
    .mutation(({ input }) => {
      const { userId, ...processInput } = input;
      return processDisposition(processInput, userId);
    }),

  getDispositionAssignments: publicProcedure
    .input(z.object({
      requestId: z.number(),
      userId: z.number().optional()
    }))
    .query(({ input }) => getDispositionAssignments(input.requestId, input.userId)),

  // Final letter and signature workflow
  uploadFinalLetter: publicProcedure
    .input(uploadFinalLetterInputSchema.extend({
      userId: z.number() // Current user uploading (usually KAUR)
    }))
    .mutation(({ input }) => {
      const { userId, ...uploadInput } = input;
      return uploadFinalLetter(uploadInput, userId);
    }),

  signLetter: publicProcedure
    .input(signLetterInputSchema.extend({
      dekanUserId: z.number() // Dean signing the letter
    }))
    .mutation(({ input }) => {
      const { dekanUserId, ...signInput } = input;
      return signLetter(signInput, dekanUserId);
    }),

  // Document management
  uploadSupportingDocument: publicProcedure
    .input(z.object({
      requestId: z.number(),
      fileName: z.string(),
      fileUrl: z.string(),
      userId: z.number()
    }))
    .mutation(({ input }) => 
      uploadSupportingDocument(input.requestId, input.fileName, input.fileUrl, input.userId)
    ),

  getSupportingDocuments: publicProcedure
    .input(z.object({
      requestId: z.number(),
      userId: z.number().optional()
    }))
    .query(({ input }) => getSupportingDocuments(input.requestId, input.userId)),

  // Audit trail
  getTrackingLogs: publicProcedure
    .input(z.object({
      requestId: z.number(),
      userId: z.number().optional()
    }))
    .query(({ input }) => getTrackingLogs(input.requestId, input.userId)),

  addTrackingLog: publicProcedure
    .input(addTrackingLogInputSchema.extend({
      userId: z.number() // User creating the log entry
    }))
    .mutation(({ input }) => {
      const { userId, ...logInput } = input;
      return addTrackingLog(logInput, userId);
    }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`Document Management System TRPC server listening at port: ${port}`);
  console.log(`Available endpoints:`);
  console.log(`- Health check: GET /healthcheck`);
  console.log(`- User management: createUser, getUserById, getUsersByRole`);
  console.log(`- Student management: createStudent, getStudents`);
  console.log(`- Letter requests: createLetterRequest, updateRequestStatus, getRequests, getRequestById`);
  console.log(`- Disposition workflow: createDisposition, processDisposition, getDispositionAssignments`);
  console.log(`- Document workflow: uploadFinalLetter, signLetter`);
  console.log(`- Supporting documents: uploadSupportingDocument, getSupportingDocuments`);
  console.log(`- Audit trail: getTrackingLogs, addTrackingLog`);
}

start();