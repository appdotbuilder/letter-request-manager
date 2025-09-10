import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, supportingDocumentsTable } from '../db/schema';
import { getSupportingDocuments } from '../handlers/get_supporting_documents';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'STAFF_PRODI' as const,
  prodi: 'Informatika'
};

const testAdminUser = {
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'ADMIN' as const,
  prodi: null
};

const testStudent = {
  nim: '123456789',
  name: 'Test Student',
  prodi: 'Informatika'
};

const testOtherUser = {
  email: 'other@example.com',
  name: 'Other User',
  role: 'STAFF_PRODI' as const,
  prodi: 'Matematika'
};

describe('getSupportingDocuments', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return supporting documents for a valid request', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    // Create supporting documents
    const doc1 = await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document1.pdf',
      file_url: '/files/doc1.pdf',
      uploaded_by_user_id: user.id
    }).returning().execute();

    const doc2 = await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document2.pdf',
      file_url: '/files/doc2.pdf',
      uploaded_by_user_id: user.id
    }).returning().execute();

    const result = await getSupportingDocuments(letterRequest.id, user.id);

    expect(result).toHaveLength(2);
    expect(result[0].id).toEqual(doc1[0].id);
    expect(result[0].file_name).toEqual('document1.pdf');
    expect(result[0].file_url).toEqual('/files/doc1.pdf');
    expect(result[0].letter_request_id).toEqual(letterRequest.id);
    expect(result[0].uploaded_by_user_id).toEqual(user.id);
    expect(result[0].created_at).toBeInstanceOf(Date);

    expect(result[1].id).toEqual(doc2[0].id);
    expect(result[1].file_name).toEqual('document2.pdf');
    expect(result[1].file_url).toEqual('/files/doc2.pdf');
  });

  it('should return documents sorted by created_at ascending', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    // Create documents with different timestamps
    const laterTime = new Date();
    const earlierTime = new Date(laterTime.getTime() - 60000); // 1 minute earlier

    // Insert later document first
    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'later_document.pdf',
      file_url: '/files/later.pdf',
      uploaded_by_user_id: user.id,
      created_at: laterTime
    }).execute();

    // Insert earlier document second
    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'earlier_document.pdf',
      file_url: '/files/earlier.pdf',
      uploaded_by_user_id: user.id,
      created_at: earlierTime
    }).execute();

    const result = await getSupportingDocuments(letterRequest.id, user.id);

    expect(result).toHaveLength(2);
    // Should be sorted by created_at ascending (earlier first)
    expect(result[0].file_name).toEqual('earlier_document.pdf');
    expect(result[1].file_name).toEqual('later_document.pdf');
    expect(result[0].created_at.getTime()).toBeLessThan(result[1].created_at.getTime());
  });

  it('should return empty array for non-existent request', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    
    const result = await getSupportingDocuments(999, user.id);
    
    expect(result).toEqual([]);
  });

  it('should return empty array when user has no permission', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [otherUser] = await db.insert(usersTable).values(testOtherUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document.pdf',
      file_url: '/files/doc.pdf',
      uploaded_by_user_id: user.id
    }).execute();

    // Other user should not have permission
    const result = await getSupportingDocuments(letterRequest.id, otherUser.id);
    
    expect(result).toEqual([]);
  });

  it('should allow admin to view any request documents', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [adminUser] = await db.insert(usersTable).values(testAdminUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'admin_viewable_doc.pdf',
      file_url: '/files/admin_doc.pdf',
      uploaded_by_user_id: user.id
    }).execute();

    // Admin should have permission to view any documents
    const result = await getSupportingDocuments(letterRequest.id, adminUser.id);
    
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toEqual('admin_viewable_doc.pdf');
  });

  it('should allow current handler to view documents', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [handlerUser] = await db.insert(usersTable).values(testOtherUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'APPROVED_KAPRODI',
      current_handler_user_id: handlerUser.id // Handler is different from creator
    }).returning().execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'handler_viewable_doc.pdf',
      file_url: '/files/handler_doc.pdf',
      uploaded_by_user_id: user.id
    }).execute();

    // Handler should have permission to view documents
    const result = await getSupportingDocuments(letterRequest.id, handlerUser.id);
    
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toEqual('handler_viewable_doc.pdf');
  });

  it('should return all documents without user permission check when userId not provided', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'public_document.pdf',
      file_url: '/files/public_doc.pdf',
      uploaded_by_user_id: user.id
    }).execute();

    // No user ID provided - should return documents without permission check
    const result = await getSupportingDocuments(letterRequest.id);
    
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toEqual('public_document.pdf');
  });

  it('should return empty array when user does not exist', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document.pdf',
      file_url: '/files/doc.pdf',
      uploaded_by_user_id: user.id
    }).execute();

    // Non-existent user ID
    const result = await getSupportingDocuments(letterRequest.id, 999);
    
    expect(result).toEqual([]);
  });

  it('should return empty array when no supporting documents exist', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user.id
    }).returning().execute();

    // No supporting documents created
    const result = await getSupportingDocuments(letterRequest.id, user.id);
    
    expect(result).toEqual([]);
  });

  it('should handle multiple documents from different uploaders', async () => {
    // Create prerequisite data
    const [user1] = await db.insert(usersTable).values(testUser).returning().execute();
    const [user2] = await db.insert(usersTable).values(testOtherUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user1.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      status: 'DRAFT',
      current_handler_user_id: user1.id
    }).returning().execute();

    // Create documents from different uploaders
    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document_by_user1.pdf',
      file_url: '/files/doc1.pdf',
      uploaded_by_user_id: user1.id
    }).execute();

    await db.insert(supportingDocumentsTable).values({
      letter_request_id: letterRequest.id,
      file_name: 'document_by_user2.pdf',
      file_url: '/files/doc2.pdf',
      uploaded_by_user_id: user2.id
    }).execute();

    const result = await getSupportingDocuments(letterRequest.id, user1.id);

    expect(result).toHaveLength(2);
    
    // Find documents by uploader
    const docByUser1 = result.find(doc => doc.uploaded_by_user_id === user1.id);
    const docByUser2 = result.find(doc => doc.uploaded_by_user_id === user2.id);

    expect(docByUser1).toBeDefined();
    expect(docByUser1?.file_name).toEqual('document_by_user1.pdf');
    
    expect(docByUser2).toBeDefined();
    expect(docByUser2?.file_name).toEqual('document_by_user2.pdf');
  });
});