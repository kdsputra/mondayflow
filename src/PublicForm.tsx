import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Send } from "lucide-react";
import { loadPublishedForm, submitPublishedForm } from "./database";
import type { WorkForm } from "./platform";

export default function PublicForm({ formId }: { formId: string }) {
  const [form, setForm] = useState<WorkForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadPublishedForm(formId).then(setForm).catch((caught: Error) => setError(caught.message)).finally(() => setLoading(false));
  }, [formId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const missing = form.fields.find((field) => field.required && !values[field.id]?.trim());
    if (missing) return setError(`${missing.label} is required.`);
    setSubmitting(true); setError("");
    try {
      await submitPublishedForm(form, values);
      setSubmitted(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="public-form-page"><div className="public-form-brand"><span><ClipboardList size={19} /></span><strong>MondayFlow</strong></div><section className="public-form-shell">
    {loading ? <div className="public-form-state"><div className="loader" /><strong>Loading form</strong></div> : null}
    {!loading && !form ? <div className="public-form-state"><AlertCircle size={26} /><strong>Form unavailable</strong><span>The form may be unpublished or the link is invalid.</span></div> : null}
    {form && submitted ? <div className="public-form-state success"><CheckCircle2 size={34} /><strong>Response received</strong><span>Your submission has been stored securely.</span><button className="secondary-button" onClick={() => { setValues({}); setSubmitted(false); }}>Submit another response</button></div> : null}
    {form && !submitted ? <form onSubmit={submit}><header><span>WORK REQUEST</span><h1>{form.title}</h1><p>{form.description}</p></header>{form.fields.map((field) => <label key={field.id}>{field.label}{field.required ? <b>Required</b> : null}{field.type === "long_text" ? <textarea value={values[field.id] ?? ""} onChange={(event) => setValues({ ...values, [field.id]: event.target.value })} /> : field.type === "dropdown" ? <select value={values[field.id] ?? ""} onChange={(event) => setValues({ ...values, [field.id]: event.target.value })}><option value="">Select an option</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"} value={values[field.id] ?? ""} onChange={(event) => setValues({ ...values, [field.id]: event.target.value })} />}</label>)}{error ? <div className="public-form-error"><AlertCircle size={15} />{error}</div> : null}<button className="primary-button public-submit" disabled={submitting}><Send size={16} /> {submitting ? "Submitting..." : "Submit response"}</button></form> : null}
  </section><footer>Secure form powered by MondayFlow</footer></main>;
}
