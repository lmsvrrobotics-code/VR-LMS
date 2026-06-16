import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BatchForm from '../college/BatchForm';
import ManageBatches from '../college/ManageBatches';
import { listColleges } from '../../api/college';

/**
 * Batches — ROOT/super admin version. Same batch creation + management feature
 * as the (now-removed) college-admin one, but since the root admin has no
 * college, they first pick a college here; everything below then operates on
 * that college (the API sends ?clgId=). Add / Manage are switched via ?tab=.
 */
const VALID_TABS = ['manage', 'add'];

// Pseudo-school for batches formed from INDIVIDUAL students (no school).
// The backend treats clgId='independent' as "any student is eligible", so the
// admin can mix students from anywhere — or students with no school at all —
// into one batch and assign it to courses/programs like any school batch.
const INDEPENDENT_OPTION = { value: 'independent', label: 'Independent students (no school)' };

export default function AdminBatchesIndex() {
    const [params, setParams] = useSearchParams();
    const tab = VALID_TABS.includes(params.get('tab')) ? params.get('tab') : 'manage';

    const [colleges, setColleges] = useState([]);
    const [collegesLoading, setCollegesLoading] = useState(true);
    const [collegesError, setCollegesError] = useState(null);
    const [clgId, setClgId] = useState('');
    const [batchesRefreshKey, setBatchesRefreshKey] = useState(0);

    useEffect(() => {
        let alive = true;
        listColleges({ per_page: 1000 })
            .then((res) => {
                if (!alive) return;
                const schools = (res?.colleges || res?.data || res || []).map((c) => ({
                    value: String(c.clgId ?? c.id ?? c.clg_id ?? ''),
                    label: c.clgName ?? c.name ?? c.college_name ?? `School ${c.clgId ?? c.id}`,
                })).filter((c) => c.value);
                // "Independent students" is always offered — batches can be
                // formed from individual students even when no school exists.
                const list = [INDEPENDENT_OPTION, ...schools];
                setColleges(list);
                // Auto-select the first option so the page is immediately usable
                // (Independent when there are no schools yet).
                if (!clgId) setClgId(list[0].value);
            })
            .catch((e) => {
                setCollegesError(e?.response?.data?.error || 'Failed to load schools');
                // Even if the schools lookup fails, independent batches still work.
                setColleges([INDEPENDENT_OPTION]);
                if (!clgId) setClgId(INDEPENDENT_OPTION.value);
            })
            .finally(() => { if (alive) setCollegesLoading(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const switchTab = (key) => {
        const next = new URLSearchParams(params);
        if (key === 'manage') next.delete('tab');
        else next.set('tab', key);
        setParams(next, { replace: true });
    };

    const selectedLabel = useMemo(
        () => colleges.find((c) => c.value === clgId)?.label || '',
        [colleges, clgId],
    );

    return (
        <div>
            {/* Header + college selector + Add/Manage switch */}
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body px-5 py-4 my-1">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="text-[16px] font-semibold text-dark m-0">Batches</h4>
                        <div className="flex items-center gap-3 flex-wrap">
                            <label className="text-[13px] text-gray">School</label>
                            <select
                                className="ol-form-control text-[13px] min-w-[240px]"
                                value={clgId}
                                onChange={(e) => setClgId(e.target.value)}
                                disabled={collegesLoading || colleges.length === 0}
                            >
                                {collegesLoading && <option>Loading schools…</option>}
                                {!collegesLoading && colleges.length > 0 && (
                                    <>
                                        <option value="">— Select —</option>
                                        {colleges.map((c) => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </>
                                )}
                            </select>
                            <div className="flex rounded-ol-8 overflow-hidden border border-ebordermuted">
                                <button
                                    type="button"
                                    onClick={() => switchTab('manage')}
                                    className={`px-3 py-1.5 text-[13px] font-semibold ${tab === 'manage' ? 'bg-primary/10 text-primary' : 'text-gray hover:text-dark'}`}
                                >
                                    Manage Batches
                                </button>
                                <button
                                    type="button"
                                    onClick={() => switchTab('add')}
                                    className={`px-3 py-1.5 text-[13px] font-semibold ${tab === 'add' ? 'bg-primary/10 text-primary' : 'text-gray hover:text-dark'}`}
                                >
                                    Add Batch
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {collegesError && (
                <div className="ol-card rounded-ol-8 mb-3 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px]">
                    {collegesError}
                </div>
            )}

            {!clgId ? (
                <div className="ol-card rounded-ol-8">
                    <div className="ol-card-body py-12 px-6 text-center">
                        <p className="text-[15px] font-semibold text-dark mb-1">Select a school — or "Independent students"</p>
                        <p className="text-[13px] text-gray">
                            School batches contain that school's students. "Independent students (no school)" lets you form a batch from any individual students.
                        </p>
                    </div>
                </div>
            ) : tab === 'add' ? (
                <BatchForm
                    key={clgId}
                    clgId={clgId}
                    onCreated={() => { setBatchesRefreshKey((k) => k + 1); switchTab('manage'); }}
                />
            ) : (
                <>
                    {selectedLabel && (
                        <p className="text-[13px] text-gray mb-2">Showing batches for <strong className="text-dark">{selectedLabel}</strong></p>
                    )}
                    <ManageBatches key={clgId} clgId={clgId} refreshKey={batchesRefreshKey} />
                </>
            )}
        </div>
    );
}
