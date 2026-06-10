import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getEmailSettings, saveEmailSettings, sendTestEmail, getPaymentSettings, savePaymentSettings } from '../../api/settings';

// Admin → Settings → Email. Configure the SMTP provider (e.g. Brevo) and the
// sender address from the dashboard. Values are stored in the DB and override
// the .env defaults, so no redeploy is needed to change them in production.
export default function SettingsIndex() {
    const [form, setForm] = useState({
        smtp_host: '', smtp_port: '587', smtp_user: '', smtp_from: '', lms_login_url: '', smtp_pass: '',
    });
    const [passSet, setPassSet] = useState(false);
    const [source, setSource] = useState('unset');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testTo, setTestTo] = useState('');
    const [testing, setTesting] = useState(false);

    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const load = async () => {
        setLoading(true);
        try {
            const d = await getEmailSettings();
            setForm({
                smtp_host: d.smtp_host || '', smtp_port: d.smtp_port || '587', smtp_user: d.smtp_user || '',
                smtp_from: d.smtp_from || '', lms_login_url: d.lms_login_url || '', smtp_pass: '',
            });
            setPassSet(!!d.smtp_pass_set);
            setSource(d.source || 'unset');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to load settings');
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Don't send an empty password (keeps the existing one).
            const body = { ...form };
            if (!body.smtp_pass) delete body.smtp_pass;
            const d = await saveEmailSettings(body);
            setPassSet(!!d.smtp_pass_set);
            setSource(d.source || 'unset');
            setForm((s) => ({ ...s, smtp_pass: '' }));
            toast.success('Email settings saved');
        } catch (e2) {
            toast.error(e2?.response?.data?.error || 'Failed to save');
        } finally { setSaving(false); }
    };

    const test = async () => {
        if (!testTo.trim()) return toast.error('Enter a recipient email to test');
        setTesting(true);
        try {
            const r = await sendTestEmail(testTo.trim());
            toast.success(r.message || 'Test email sent');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Test failed');
        } finally { setTesting(false); }
    };

    if (loading) return <div className="py-20 text-center text-gray">Loading settings…</div>;

    return (
        <div className="max-w-3xl">
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <h4 className="text-[16px] font-semibold text-dark m-0">Email settings (SMTP)</h4>
                    <p className="text-[13px] text-gray mt-1">
                        Configure your email provider (e.g. <strong>Brevo</strong>). These values override the server
                        defaults — currently using: <span className="font-semibold text-skin">{source}</span>.
                    </p>
                </div>
            </div>

            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body p-5">
                    <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="ol-form-label">SMTP host</label>
                            <input className="ol-form-control" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp-relay.brevo.com" />
                        </div>
                        <div>
                            <label className="ol-form-label">Port</label>
                            <input className="ol-form-control" value={form.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} placeholder="587" />
                        </div>
                        <div>
                            <label className="ol-form-label">SMTP user / login</label>
                            <input className="ol-form-control" value={form.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} placeholder="your Brevo login email" />
                        </div>
                        <div>
                            <label className="ol-form-label">SMTP password / key {passSet && <span className="text-[11px] text-green-600">(set — leave blank to keep)</span>}</label>
                            <input type="password" className="ol-form-control" value={form.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} placeholder={passSet ? '••••••••' : 'Brevo SMTP key'} />
                        </div>
                        <div>
                            <label className="ol-form-label">Sender (From)</label>
                            <input className="ol-form-control" value={form.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} placeholder="VR Robotics <no-reply@yourdomain.com>" />
                        </div>
                        <div>
                            <label className="ol-form-label">Login URL (for emails)</label>
                            <input className="ol-form-control" value={form.lms_login_url} onChange={(e) => set('lms_login_url', e.target.value)} placeholder="https://yourapp.com/login" />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                            <button type="submit" className="ol-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
                            <span className="text-[12px] text-gray">The sender address must be a verified sender in your provider.</span>
                        </div>
                    </form>

                    <div className="mt-6 pt-5 border-t border-border">
                        <label className="ol-form-label">Send a test email</label>
                        <div className="flex flex-wrap gap-3 items-center">
                            <input className="ol-form-control flex-1 min-w-[220px]" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="recipient@example.com" />
                            <button type="button" className="ol-btn-outline-secondary" onClick={test} disabled={testing}>{testing ? 'Sending…' : 'Send test'}</button>
                        </div>
                        <p className="text-[12px] text-gray mt-2">Save your settings first, then send a test to confirm delivery.</p>
                    </div>
                </div>
            </div>

            <PaymentSettings />
        </div>
    );
}

// Admin → Settings → Payments (Razorpay). Paste your key_id and key_secret from
// the Razorpay dashboard to switch payments on. Stored in the DB and overrides
// the .env defaults — no redeploy needed. Secrets are write-only (never shown).
function PaymentSettings() {
    const [form, setForm] = useState({ razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
    const [secretSet, setSecretSet] = useState(false);
    const [webhookSet, setWebhookSet] = useState(false);
    const [configured, setConfigured] = useState(false);
    const [source, setSource] = useState('unset');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const load = async () => {
        setLoading(true);
        try {
            const d = await getPaymentSettings();
            setForm({ razorpay_key_id: d.razorpay_key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
            setSecretSet(!!d.razorpay_key_secret_set);
            setWebhookSet(!!d.razorpay_webhook_secret_set);
            setConfigured(!!d.configured);
            setSource(d.source || 'unset');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to load payment settings');
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = { razorpay_key_id: form.razorpay_key_id };
            if (form.razorpay_key_secret) body.razorpay_key_secret = form.razorpay_key_secret;
            if (form.razorpay_webhook_secret) body.razorpay_webhook_secret = form.razorpay_webhook_secret;
            const d = await savePaymentSettings(body);
            setSecretSet(!!d.razorpay_key_secret_set);
            setWebhookSet(!!d.razorpay_webhook_secret_set);
            setConfigured(!!d.configured);
            setSource(d.source || 'unset');
            setForm((s) => ({ ...s, razorpay_key_secret: '', razorpay_webhook_secret: '' }));
            toast.success('Payment settings saved');
        } catch (e2) {
            toast.error(e2?.response?.data?.error || 'Failed to save');
        } finally { setSaving(false); }
    };

    if (loading) return null;

    return (
        <div className="mt-6">
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <h4 className="text-[16px] font-semibold text-dark m-0">Payment settings (Razorpay)</h4>
                    <p className="text-[13px] text-gray mt-1">
                        Paste your keys from the <strong>Razorpay dashboard → Settings → API Keys</strong> to turn on
                        course payments. Status:{' '}
                        <span className={`font-semibold ${configured ? 'text-green-600' : 'text-red-500'}`}>
                            {configured ? 'configured ✓' : 'not configured'}
                        </span>{' '}
                        (source: <span className="font-semibold text-skin">{source}</span>).
                    </p>
                </div>
            </div>

            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body p-5">
                    <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="ol-form-label">Key ID</label>
                            <input className="ol-form-control" value={form.razorpay_key_id} onChange={(e) => set('razorpay_key_id', e.target.value)} placeholder="rzp_live_xxxxxxxxxxxxx" />
                        </div>
                        <div>
                            <label className="ol-form-label">Key Secret {secretSet && <span className="text-[11px] text-green-600">(set — leave blank to keep)</span>}</label>
                            <input type="password" className="ol-form-control" value={form.razorpay_key_secret} onChange={(e) => set('razorpay_key_secret', e.target.value)} placeholder={secretSet ? '••••••••' : 'paste key secret'} autoComplete="new-password" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="ol-form-label">Webhook Secret <span className="text-[11px] text-gray">(optional) {webhookSet && <span className="text-green-600">— set</span>}</span></label>
                            <input type="password" className="ol-form-control" value={form.razorpay_webhook_secret} onChange={(e) => set('razorpay_webhook_secret', e.target.value)} placeholder={webhookSet ? '••••••••' : 'from Razorpay → Webhooks'} autoComplete="new-password" />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                            <button type="submit" className="ol-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save payment settings'}</button>
                            <span className="text-[12px] text-gray">Key Secret is never displayed back. Use a <code>rzp_test_</code> key to trial checkout.</span>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
