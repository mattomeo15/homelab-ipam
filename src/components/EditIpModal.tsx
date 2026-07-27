import React, { useState, useEffect } from 'react';
import { IPRecord, ServiceItem } from '../types';
import { X, Plus, Trash2, Save, Shield } from 'lucide-react';

interface EditIpModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: IPRecord | null;
  onSave: (ip: string, updated: Partial<IPRecord>) => Promise<void>;
}

export const EditIpModal: React.FC<EditIpModalProps> = ({
  isOpen,
  onClose,
  record,
  onSave,
}) => {
  const [hostname, setHostname] = useState<string>('');
  const [status, setStatus] = useState<'Active' | 'Free' | 'Reserved'>('Active');
  const [typeTag, setTypeTag] = useState<IPRecord['typeTag']>('Physical Hardware');
  const [macAddress, setMacAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (record) {
      setHostname(record.hostname || '');
      setStatus(record.status || 'Active');
      setTypeTag(record.typeTag || 'Physical Hardware');
      setMacAddress(record.macAddress || '');
      setNotes(record.notes || '');
      setServices(record.services ? [...record.services] : []);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleAddServiceRow = () => {
    const newService: ServiceItem = {
      id: `svc-manual-${Date.now()}`,
      name: 'Web Service',
      port: 8080,
      protocol: 'http',
      url: `http://${record.ip}:8080`
    };
    setServices([...services, newService]);
  };

  const handleRemoveService = (id: string) => {
    setServices(services.filter((s) => s.id !== id));
  };

  const handleServiceChange = (
    id: string,
    field: keyof ServiceItem,
    val: any
  ) => {
    setServices(
      services.map((s) => {
        if (s.id === id) {
          const updated = { ...s, [field]: val };
          if (field === 'port' || field === 'protocol') {
            const proto = field === 'protocol' ? val : s.protocol;
            const pt = field === 'port' ? val : s.port;
            updated.url = `${proto}://${record.ip}:${pt}`;
          }
          return updated;
        }
        return s;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(record.ip, {
        hostname,
        status,
        typeTag,
        macAddress,
        notes,
        services
      });
      onClose();
    } catch (err) {
      console.error('Failed to save IP record:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>Edit IP Configuration</span>
              <span className="font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 text-sm">
                {record.ip}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Update device host metadata and manage nested app ports/services.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Hostname / FQDN
              </label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="e.g. pve-host01.homelab.local"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                IP Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Active">Active</option>
                <option value="Free">Free</option>
                <option value="Reserved">Reserved</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Device Type Tag
              </label>
              <select
                value={typeTag}
                onChange={(e) => setTypeTag(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Physical Hardware">Physical Hardware</option>
                <option value="Macvlan Container">Macvlan Container</option>
                <option value="Shared/Host Container">Shared/Host Container</option>
                <option value="Gateway / Router">Gateway / Router</option>
                <option value="Infrastructure">Infrastructure</option>
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                MAC Address
              </label>
              <input
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="00:11:22:33:44:55"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Notes & Hardware Description
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Dell PowerEdge R740, 64GB RAM, running Proxmox VE 8.1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Child Services Section */}
          <div className="border-t border-slate-800 pt-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Hosted Services & Container Ports
                </h4>
                <p className="text-[11px] text-slate-500">
                  Multiple services can share this IP on different exposed ports.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddServiceRow}
                className="inline-flex items-center space-x-1 text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-emerald-400 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add App Port</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {services.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3 text-center bg-slate-950 rounded-xl border border-slate-800/60">
                  No child services added yet. Click "+ Add App Port" to register hosted apps.
                </div>
              ) : (
                services.map((svc) => (
                  <div
                    key={svc.id}
                    className="flex flex-col sm:flex-row items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800"
                  >
                    <input
                      type="text"
                      placeholder="Service Name (e.g. Portainer)"
                      value={svc.name}
                      onChange={(e) =>
                        handleServiceChange(svc.id, 'name', e.target.value)
                      }
                      className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                      <input
                        type="number"
                        placeholder="Port"
                        value={svc.port}
                        onChange={(e) =>
                          handleServiceChange(
                            svc.id,
                            'port',
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <select
                        value={svc.protocol}
                        onChange={(e) =>
                          handleServiceChange(svc.id, 'protocol', e.target.value)
                        }
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="http">http</option>
                        <option value="https">https</option>
                        <option value="tcp">tcp</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveService(svc.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl font-medium transition-colors inline-flex items-center space-x-1.5 shadow-lg shadow-emerald-950/40"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
