import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onConfirm, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements?.[0];
      const lastElement = focusableElements?.[focusableElements.length - 1];

      firstElement?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) { // Shift + Tab
          if (document.activeElement === firstElement) {
            lastElement?.focus();
            e.preventDefault();
          }
        } else { // Tab
          if (document.activeElement === lastElement) {
            firstElement?.focus();
            e.preventDefault();
          }
        }
      };
      
      const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              onClose();
          }
      };

      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keydown', handleEsc);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keydown', handleEsc);
        lastFocusedElement.current?.focus();
      };
    }
  }, [isOpen, onClose]);


  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" 
        aria-modal="true" 
        role="dialog"
        aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4" ref={modalRef}>
        <h3 id="modal-title" className="text-xl font-bold text-gray-800 mb-4">{title}</h3>
        <div className="text-gray-600 mb-6">
          {children}
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 font-semibold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none transition-colors duration-200"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;