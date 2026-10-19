import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// The 10-attempts-per-15-minutes limiter would throttle the test run itself.
jest.mock('express-rate-limit', () => () => (_req: any, _res: any, next: () => void) => next());

// In-memory stand-in for the admin_users table.
const admins: { id: string; name: string; email: string; passwordHash: string; role: string; status: string }[] = [];

jest.mock('../utils/prisma', () => ({
  prisma: {
    adminUser: {
      count: jest.fn(async ({ where }: any = {}) => admins.filter(a => !where?.status || a.status === where.status).length),
      findUnique: jest.fn(async ({ where }: any) => admins.find(a => (where.id ? a.id === where.id : a.email === where.email)) || null),
      create: jest.fn(async ({ data }: any) => {
        const admin = { id: `admin-${admins.length + 1}`, ...data };
        admins.push(admin);
        return admin;
      }),
    },
  },
}));

process.env.ADMIN_JWT_SECRET = 'test-admin-secret';
process.env.JWT_SECRET = 'test-student-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Imported after the mock so the router uses the in-memory table.
import { authRouter } from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const tokenFor = (adminId: string) => jwt.sign({ adminId, email: 'x', role: 'admin' }, 'test-admin-secret');
const body = (n: number) => ({ name: `Admin ${n}`, email: `admin${n}@nmims.test`, password: 'Passw0rd!x' });

describe('admin sign-up lockdown', () => {
  beforeEach(() => {
    admins.length = 0;
  });

  it('reports setup required only while no admin exists', async () => {
    expect((await request(app).get('/api/auth/admin/setup-status')).body).toEqual({ setupRequired: true });
    await request(app).post('/api/auth/admin/signup').send(body(1));
    expect((await request(app).get('/api/auth/admin/setup-status')).body).toEqual({ setupRequired: false });
  });

  it('lets the first account register publicly and makes it superadmin', async () => {
    const res = await request(app).post('/api/auth/admin/signup').send(body(1));
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe('superadmin');
  });

  it('turns public sign-up into a pending request once an admin exists', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    const res = await request(app).post('/api/auth/admin/signup').send(body(2));
    expect(res.status).toBe(202);
    expect(res.body.pending).toBe(true);
    expect(admins[1]).toMatchObject({ email: 'admin2@nmims.test', role: 'admin', status: 'pending' });
  });

  it('never lets a pending request sign in', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    await request(app).post('/api/auth/admin/signup').send(body(2));
    const res = await request(app).post('/api/auth/admin/signin').send({ email: 'admin2@nmims.test', password: 'Passw0rd!x' });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('does not let forged or non-superadmin tokens create active admins', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    admins.push({ id: 'plain', name: 'Plain', email: 'plain@nmims.test', passwordHash: 'x', role: 'admin', status: 'active' });
    const forged = jwt.sign({ adminId: 'admin-1' }, 'wrong-secret');
    await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${forged}`).send(body(3));
    await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${tokenFor('plain')}`).send(body(4));
    expect(admins.filter(a => a.status === 'active')).toHaveLength(2);
    expect(admins.filter(a => a.status === 'pending')).toHaveLength(2);
  });

  it('lets a superadmin create further admins with the admin role', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    const res = await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${tokenFor('admin-1')}`).send(body(2));
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe('admin');
    expect(admins[1].status).toBe('active');
  });

  it('validates input before anything else', async () => {
    const res = await request(app).post('/api/auth/admin/signup').send({ name: '', email: 'bad', password: 'short' });
    expect(res.status).toBe(400);
  });
});
