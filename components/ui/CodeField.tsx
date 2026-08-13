import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface CodeFieldProps {
  value: string;
  label?: string;
  className?: string;
  readOnly?: boolean;
}

export const CodeField: React.FC<CodeFieldProps> = ({
  value,
  label,
  className = '',
  readOnly = true,
}) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          type="text"
          readOnly={readOnly}
          value={value}
          onFocus={e => e.currentTarget.select()}
          className="h-8 w-full rounded-md border border-[#E8DFF0] bg-[#F8F7FA] pl-2.5 pr-8 font-mono text-[11px] font-medium text-[#1B1024] outline-none transition-colors focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA] dark:focus:border-[#8B5CF6]"
        />
        <button
          type="button"
          onClick={copyToClipboard}
          className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-[#6F6078] hover:bg-[#E8DFF0] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:bg-[#371F59] dark:hover:text-white transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check size={13} className="text-[#16A36A]" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
};

export default CodeField;
