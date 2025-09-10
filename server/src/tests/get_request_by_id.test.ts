import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  studentsTable, 
  letterRequestsTable, 
  supportingDocumentsTable, 
  trackingLogsTable, 
  dispositionAssignmentsTable 
} from '../db/schema';
import { getRequestById } from '../handlers/get_request_by_id';
import { eq } from 'drizzle-orm';

describe('getRequestById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  let testUser: any;
  let testStudent: any;
  let testRequest: any;
  let adminUser: any;
  let otherUser: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'staff@university.edu',
          name: 'Staff Prodi',
          role: 'STAFF_PRODI',
          prodi: 'Informatika'
        },
        {
          email: 'admin@university.edu',
          name: 'Admin User',
          role: 'ADMIN',
          prodi: null
        },
        {
          email: 'other@university.edu',
          name: 'Other User',
          role: 'STAFF_PRODI',
          prodi: 'Sistem Informasi'
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    adminUser = users[1];
    otherUser = users[2];

    // Create test student
    const students = await db.insert(studentsTable)
      .values({
        nim: '12345678',
        name: 'Test Student',
        prodi: 'Informatika'
      })
      .returning()
      .execute();

    testStudent = students[0];

    // Create test letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: testStudent.id,
        created_by_user_id: testUser.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DRAFT',
        current_handler_user_id: testUser.id
      })
      .returning()
      .execute();

    testRequest = requests[0];
  });

  it('should return null for non-existent request', async () => {
    const result = await getRequestById(99999);
    expect(result).toBeNull();
  });

  it('should return letter request with basic data', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(testRequest.id);
    expect(result!.student_id).toBe(testStudent.id);
    expect(result!.created_by_user_id).toBe(testUser.id);
    expect(result!.letter_type).toBe('Surat Keterangan Aktif');
    expect(result!.purpose).toBe('Keperluan beasiswa');
    expect(result!.priority).toBe('NORMAL');
    expect(result!.status).toBe('DRAFT');
    expect(result!.current_handler_user_id).toBe(testUser.id);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should include related student data', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).student).not.toBeNull();
    expect((result as any).student.id).toBe(testStudent.id);
    expect((result as any).student.nim).toBe('12345678');
    expect((result as any).student.name).toBe('Test Student');
    expect((result as any).student.prodi).toBe('Informatika');
  });

  it('should include creator user data', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).created_by).not.toBeNull();
    expect((result as any).created_by.id).toBe(testUser.id);
    expect((result as any).created_by.name).toBe('Staff Prodi');
    expect((result as any).created_by.email).toBe('staff@university.edu');
    expect((result as any).created_by.role).toBe('STAFF_PRODI');
  });

  it('should include current handler data', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).current_handler).not.toBeNull();
    expect((result as any).current_handler.id).toBe(testUser.id);
    expect((result as any).current_handler.name).toBe('Staff Prodi');
  });

  it('should include supporting documents', async () => {
    // Add a supporting document
    await db.insert(supportingDocumentsTable)
      .values({
        letter_request_id: testRequest.id,
        file_name: 'document.pdf',
        file_url: 'https://example.com/document.pdf',
        uploaded_by_user_id: testUser.id
      })
      .execute();

    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).supporting_documents).toHaveLength(1);
    expect((result as any).supporting_documents[0].file_name).toBe('document.pdf');
    expect((result as any).supporting_documents[0].file_url).toBe('https://example.com/document.pdf');
    expect((result as any).supporting_documents[0].uploaded_by.name).toBe('Staff Prodi');
  });

  it('should include tracking logs', async () => {
    // Add a tracking log
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: testRequest.id,
        user_id: testUser.id,
        action_type: 'CREATED',
        description: 'Request created',
        notes: 'Initial creation',
        new_status: 'DRAFT'
      })
      .execute();

    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).tracking_logs).toHaveLength(1);
    expect((result as any).tracking_logs[0].action_type).toBe('CREATED');
    expect((result as any).tracking_logs[0].description).toBe('Request created');
    expect((result as any).tracking_logs[0].notes).toBe('Initial creation');
    expect((result as any).tracking_logs[0].user.name).toBe('Staff Prodi');
  });

  it('should include disposition assignments', async () => {
    // Add a disposition assignment
    await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: testRequest.id,
        assigned_to_user_id: adminUser.id,
        assigned_by_user_id: testUser.id,
        instructions: 'Please review',
        order_sequence: 1,
        is_completed: false
      })
      .execute();

    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).disposition_assignments).toHaveLength(1);
    expect((result as any).disposition_assignments[0].instructions).toBe('Please review');
    expect((result as any).disposition_assignments[0].order_sequence).toBe(1);
    expect((result as any).disposition_assignments[0].is_completed).toBe(false);
    expect((result as any).disposition_assignments[0].assigned_to.name).toBe('Admin User');
  });

  it('should allow creator to view their own request', async () => {
    const result = await getRequestById(testRequest.id, testUser.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testRequest.id);
  });

  it('should allow current handler to view request', async () => {
    const result = await getRequestById(testRequest.id, testUser.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testRequest.id);
  });

  it('should allow admin to view any request', async () => {
    const result = await getRequestById(testRequest.id, adminUser.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testRequest.id);
  });

  it('should deny access to unauthorized user', async () => {
    const result = await getRequestById(testRequest.id, otherUser.id);
    expect(result).toBeNull();
  });

  it('should allow faculty staff to view requests', async () => {
    // Create a DEKAN user
    const dekanUser = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dekan User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const result = await getRequestById(testRequest.id, dekanUser[0].id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testRequest.id);
  });

  it('should return null for invalid user ID', async () => {
    const result = await getRequestById(testRequest.id, 99999);
    expect(result).toBeNull();
  });

  it('should handle request without current handler', async () => {
    // Update request to have no current handler
    await db.update(letterRequestsTable)
      .set({ current_handler_user_id: null })
      .where(eq(letterRequestsTable.id, testRequest.id))
      .execute();

    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect(result!.current_handler_user_id).toBeNull();
    expect((result as any).current_handler).toBeNull();
  });

  it('should handle request with empty supporting documents', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).supporting_documents).toHaveLength(0);
  });

  it('should handle request with empty tracking logs', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).tracking_logs).toHaveLength(0);
  });

  it('should handle request with empty dispositions', async () => {
    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).disposition_assignments).toHaveLength(0);
  });

  it('should handle multiple supporting documents correctly', async () => {
    // Add multiple supporting documents
    await db.insert(supportingDocumentsTable)
      .values([
        {
          letter_request_id: testRequest.id,
          file_name: 'document1.pdf',
          file_url: 'https://example.com/document1.pdf',
          uploaded_by_user_id: testUser.id
        },
        {
          letter_request_id: testRequest.id,
          file_name: 'document2.pdf',
          file_url: 'https://example.com/document2.pdf',
          uploaded_by_user_id: adminUser.id
        }
      ])
      .execute();

    const result = await getRequestById(testRequest.id);

    expect(result).not.toBeNull();
    expect((result as any).supporting_documents).toHaveLength(2);
    
    const doc1 = (result as any).supporting_documents.find((d: any) => d.file_name === 'document1.pdf');
    const doc2 = (result as any).supporting_documents.find((d: any) => d.file_name === 'document2.pdf');
    
    expect(doc1).toBeDefined();
    expect(doc1.uploaded_by.name).toBe('Staff Prodi');
    expect(doc2).toBeDefined();
    expect(doc2.uploaded_by.name).toBe('Admin User');
  });
});