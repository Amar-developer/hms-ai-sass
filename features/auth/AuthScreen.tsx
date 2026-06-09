'use client';

import {useState} from 'react';
import {Eye,EyeOff,HeartPulse,Lock,ShieldCheck} from 'lucide-react';
import {Button,Card,Field,Input} from '@/components/common/ui';

type DemoUser = readonly [string, string, string];

export function AuthScreen({ role, setRole, onLogin, demoUsers, loginPresets }: any) {
  const showDemoCredentials =
    process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true' ||
    process.env.NODE_ENV !== 'production';
  const preset = loginPresets[role] || loginPresets.tenant_admin;
  const [email,setEmail] = useState(showDemoCredentials ? preset.email : '');
  const [password,setPassword] = useState(showDemoCredentials ? preset.password : '');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [showDemo,setShowDemo] = useState(false);
  const [showPassword,setShowPassword] = useState(false);

  function fillDemo(id: string) {
    const next = loginPresets[id] || loginPresets.tenant_admin;
    setRole(id);
    setEmail(next.email);
    setPassword(next.password);
    setError('');
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin({ email, password });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">
              <ShieldCheck size={18} />
              Primary tenant secured by MedizinHub HMS
            </div>
            <h1 className="text-5xl font-bold leading-tight tracking-normal text-slate-950">
              MedizinHub HMS
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
              A secure healthcare workspace for tenants, branches, doctors, staff, lab, pharmacy,
              billing, and platform administrators.
            </p>
            <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-2">
              {['Tenant aware access', 'Role based screens', 'Audited user actions', 'Multi branch ready'].map(
                (item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <HeartPulse />
            </div>
            <div>
              <h1 className="text-2xl font-bold">MedizinHub HMS</h1>
              <p className="text-sm text-slate-500">Secure healthcare SaaS workspace</p>
            </div>
          </div>

          <Card className="rounded-2xl p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Lock />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Sign in</h2>
                <p className="text-sm text-slate-500">Use your account credentials.</p>
              </div>
            </div>

            <form onSubmit={submit} className="grid gap-4">
              <Field label="Username / Email">
                <Input
                  autoComplete="username"
                  value={email}
                  onChange={(e:any)=>setEmail(e.target.value)}
                  placeholder="name@clinic.com"
                  required
                />
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e:any)=>setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={()=>setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                  </button>
                </div>
              </Field>
              {error && (
                <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}
              <Button disabled={loading} className="w-full rounded-lg text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4 ">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {showDemoCredentials && <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setShowDemo(!showDemo)}
                className="text-sm font-bold text-slate-600 hover:text-slate-950"
              >
                {showDemo ? 'Hide demo credentials' : 'Use demo credentials'}
              </button>
              {showDemo && (
                <div className="mt-3 grid gap-2">
                  {demoUsers.map(([id, label, description]: DemoUser) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillDemo(id)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-sm hover:bg-white"
                    >
                      <span className="font-bold text-slate-800">{label}</span>
                      <span className="ml-2 text-xs text-slate-500">{description}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {loginPresets[id].email}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>}
          </Card>
        </section>
      </div>
    </main>
  );
}
