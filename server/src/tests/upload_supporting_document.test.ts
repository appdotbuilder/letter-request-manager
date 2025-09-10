import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, supportingDocumentsTable, trackingLogsTable } from '../db/schema';
import { uploadSupportingDocument } from '../handlers/upload_supporting_document';
import { eq } from 'drizzle-orm';

describe('uploadSupportingDocument', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testStudent: any;
  let testLetterRequest: any;
  let adminUser: any;

  beforeEach(async () => {
    // Create test user (STAFF_PRODI)
    const userResult = await db.insert(usersTable)
      .values({
        email: 'staff@test.com',
        name: 'Test Staff',
        role: 'STAFF_PRODI',
        prodi: 'Informatika'
      })
      .returning()
      .execute();
    testUser = userResult[0];

    // Create admin user
    const adminResult = await db.insert(usersTable)
      .values({
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'ADMIN'
      })
      .returning()
      .execute();
    adminUser = adminResult[0];

    // Create test student
    const studentResult = await db.insert(studentsTable)
      .values({
        nim: 'TEST001',
        name: 'Test Student',
        prodi: 'Informatika'
      })
      .returning()
      .execute();
    testStudent = studentResult[0];

    // Create test letter request
    const requestResult = await db.insert(letterRequestsTable)
      .values({
        student_id: testStudent.id,
        created_by_user_id: testUser.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Test purpose',
        priority: 'NORMAL',
        status: 'DRAFT',
        current_handler_user_id: testUser.id
      })
      .returning()
      .execute();
    testLetterRequest = requestResult[0];
  });

  it('should upload supporting document successfully', async () => {
    const fileName = 'test-document.pdf';
    const fileUrl = 'https://storage.example.com/test-document.pdf';

    const result = await uploadSupportingDocument(
      testLetterRequest.id,
      fileName,
      fileUrl,
      testUser.id
    );

    // Verify the returned document
    expect(result.id).toBeDefined();
    expect(result.letter_request_id).toEqual(testLetterRequest.id);
    expect(result.file_name).toEqual(fileName);
    expect(result.file_url).toEqual(fileUrl);
    expect(result.uploaded_by_user_id).toEqual(testUser.id);
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save document to database', async () => {
    const fileName = 'test-document.pdf';
    const fileUrl = 'https://storage.example.com/test-document.pdf';

    const result = await uploadSupportingDocument(
      testLetterRequest.id,
      fileName,
      fileUrl,
      testUser.id
    );

    // Verify document was saved to database
    const documents = await db.select()
      .from(supportingDocumentsTable)
      .where(eq(supportingDocumentsTable.id, result.id))
      .execute();

    expect(documents).toHaveLength(1);
    expect(documents[0].file_name).toEqual(fileName);
    expect(documents[0].file_url).toEqual(fileUrl);
    expect(documents[0].uploaded_by_user_id).toEqual(testUser.id);
    expect(documents[0].created_at).toBeInstanceOf(Date);
  });

  it('should create tracking log entry', async () => {
    const fileName = 'test-document.pdf';
    const fileUrl = 'https://storage.example.com/test-document.pdf';

    await uploadSupportingDocument(
      testLetterRequest.id,
      fileName,
      fileUrl,
      testUser.id
    );

    // Verify tracking log was created
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testLetterRequest.id))
      .execute();

    expect(trackingLogs).toHaveLength(1);
    expect(trackingLogs[0].user_id).toEqual(testUser.id);
    expect(trackingLogs[0].action_type).toEqual('DOCUMENT_UPLOADED');
    expect(trackingLogs[0].description).toEqual('Supporting document uploaded: test-document.pdf');
    expect(trackingLogs[0].notes).toEqual('File URL: https://storage.example.com/test-document.pdf');
    expect(trackingLogs[0].created_at).toBeInstanceOf(Date);
  });

  it('should allow admin to upload documents', async () => {
    const fileName = 'admin-document.pdf';
    const fileUrl = 'https://storage.example.com/admin-document.pdf';

    const result = await uploadSupportingDocument(
      testLetterRequest.id,
      fileName,
      fileUrl,
      adminUser.id
    );

    expect(result.uploaded_by_user_id).toEqual(adminUser.id);
    expect(result.file_name).toEqual(fileName);
  });

  it('should allow current handler to upload documents', async () => {
    // Create another user
    const handlerResult = await db.insert(usersTable)
      .values({
        email: 'handler@test.com',
        name: 'Test Handler',
        role: 'KAPRODI',
        prodi: 'Informatika'
      })
      .returning()
      .execute();
    const handlerUser = handlerResult[0];

    // Update request to have different current handler
    await db.update(letterRequestsTable)
      .set({ current_handler_user_id: handlerUser.id })
      .where(eq(letterRequestsTable.id, testLetterRequest.id))
      .execute();

    const fileName = 'handler-document.pdf';
    const fileUrl = 'https://storage.example.com/handler-document.pdf';

    const result = await uploadSupportingDocument(
      testLetterRequest.id,
      fileName,
      fileUrl,
      handlerUser.id
    );

    expect(result.uploaded_by_user_id).toEqual(handlerUser.id);
    expect(result.file_name).toEqual(fileName);
  });

  it('should allow various staff roles to upload documents', async () => {
    const roles = ['DEKAN', 'WD1', 'WD2', 'WD3', 'KABAG_TU', 'KAUR_AKADEMIK', 'STAFF_FAKULTAS'];
    
    for (const role of roles) {
      const staffResult = await db.insert(usersTable)
        .values({
          email: `${role.toLowerCase()}@test.com`,
          name: `Test ${role}`,
          role: role as any
        })
        .returning()
        .execute();
      const staffUser = staffResult[0];

      const fileName = `${role.toLowerCase()}-document.pdf`;
      const fileUrl = `https://storage.example.com/${role.toLowerCase()}-document.pdf`;

      const result = await uploadSupportingDocument(
        testLetterRequest.id,
        fileName,
        fileUrl,
        staffUser.id
      );

      expect(result.uploaded_by_user_id).toEqual(staffUser.id);
      expect(result.file_name).toEqual(fileName);
    }
  });

  it('should reject upload for non-existent letter request', async () => {
    const nonExistentRequestId = 99999;

    await expect(uploadSupportingDocument(
      nonExistentRequestId,
      'test.pdf',
      'https://example.com/test.pdf',
      testUser.id
    )).rejects.toThrow(/letter request not found/i);
  });

  it('should reject upload for non-existent user', async () => {
    const nonExistentUserId = 99999;

    await expect(uploadSupportingDocument(
      testLetterRequest.id,
      'test.pdf',
      'https://example.com/test.pdf',
      nonExistentUserId
    )).rejects.toThrow(/user not found/i);
  });

  it('should reject upload for unauthorized user', async () => {
    // Create a student user who is not associated with the request
    const unauthorizedResult = await db.insert(usersTable)
      .values({
        email: 'unauthorized@test.com',
        name: 'Unauthorized User',
        role: 'STUDENT'
      })
      .returning()
      .execute();
    const unauthorizedUser = unauthorizedResult[0];

    await expect(uploadSupportingDocument(
      testLetterRequest.id,
      'test.pdf',
      'https://example.com/test.pdf',
      unauthorizedUser.id
    )).rejects.toThrow(/does not have permission/i);
  });

  it('should handle multiple document uploads for same request', async () => {
    const documents = [
      { name: 'document1.pdf', url: 'https://example.com/doc1.pdf' },
      { name: 'document2.pdf', url: 'https://example.com/doc2.pdf' },
      { name: 'document3.pdf', url: 'https://example.com/doc3.pdf' }
    ];

    const results = [];
    for (const doc of documents) {
      const result = await uploadSupportingDocument(
        testLetterRequest.id,
        doc.name,
        doc.url,
        testUser.id
      );
      results.push(result);
    }

    // Verify all documents were created with unique IDs
    expect(results).toHaveLength(3);
    expect(new Set(results.map(r => r.id)).size).toBe(3);

    // Verify all documents exist in database
    const savedDocuments = await db.select()
      .from(supportingDocumentsTable)
      .where(eq(supportingDocumentsTable.letter_request_id, testLetterRequest.id))
      .execute();

    expect(savedDocuments).toHaveLength(3);

    // Verify tracking logs were created for all uploads
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testLetterRequest.id))
      .execute();

    expect(trackingLogs).toHaveLength(3);
    trackingLogs.forEach(log => {
      expect(log.action_type).toEqual('DOCUMENT_UPLOADED');
      expect(log.description).toMatch(/Supporting document uploaded:/);
    });
  });
});