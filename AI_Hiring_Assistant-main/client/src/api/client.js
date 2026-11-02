const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'hiring-studio.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const token = getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(formData ? {} : body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) setToken(null);
    throw new ApiError(payload.error ?? `Request failed (${response.status})`, response.status, payload.details);
  }

  return payload;
}

export const api = {
  health: () => request('/health'),
  publicJobs: () => request('/public/jobs'),
  publicJob: (id) => request('/public/jobs/' + encodeURIComponent(id)),
  applyForJob: (id, formData) => request('/public/jobs/' + encodeURIComponent(id) + '/applications', { method: 'POST', formData }),
  listApplications: (params = {}) => request('/applications?' + new URLSearchParams(params).toString()),
  getApplication: (id) => request('/applications/' + encodeURIComponent(id)),
  updateApplicationStage: (id, body) => request('/applications/' + encodeURIComponent(id) + '/stage', { method: 'PATCH', body }),
  reviewApplication: (id, body) => request('/applications/' + encodeURIComponent(id) + '/review', { method: 'PATCH', body }),

  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),

  listRoles: () => request('/roles'),
  createRole: (body) => request('/roles', { method: 'POST', body }),
  getRole: (id) => request(`/roles/${id}`),
  downloadRolePdf: async (id) => {
    const response = await fetch(`${BASE_URL}/roles/${id}/pdf`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload.error ?? `Request failed (${response.status})`, response.status, payload.details);
    }
    return { blob: await response.blob(), filename: response.headers.get('Content-Disposition') };
  },
  deleteRole: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  publishRole: (id) => request(`/roles/${id}/publish`, { method: 'POST' }),
  unpublishRole: (id) => request(`/roles/${id}/unpublish`, { method: 'POST' }),

  listCandidates: (roleId) => request(`/roles/${roleId}/candidates`),
  createCandidate: (roleId, body) => request(`/roles/${roleId}/candidates`, { method: 'POST', body }),
  updateCandidate: (id, body) => request(`/candidates/${id}`, { method: 'PUT', body }),
  deleteCandidate: (id) => request(`/candidates/${id}`, { method: 'DELETE' }),
  comparison: (roleId) => request(`/roles/${roleId}/comparison`),
  getInterview: (candidateId) => request(`/candidates/${candidateId}/interview`),
  saveInterview: (candidateId, body) => request(`/candidates/${candidateId}/interview`, { method: 'PUT', body }),
  submitInterview: (candidateId, body) => request(`/candidates/${candidateId}/interview/submit`, { method: 'POST', body }),
  parseResume: (formData) => request('/candidates/resume', { method: 'POST', formData }),
  updateRoleKit: (id, kit) => request(`/roles/${id}`, { method: 'PUT', body: { kit } }),

  knowledge: () => request('/knowledge'),
  uploadKnowledge: (formData) => request('/knowledge/upload', { method: 'POST', formData }),
  addKnowledgeNote: (body) => request('/knowledge/text', { method: 'POST', body }),
  deleteKnowledge: (id) => request(`/knowledge/${id}`, { method: 'DELETE' }),
};
