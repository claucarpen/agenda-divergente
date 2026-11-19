// Link de WhatsApp: solo abre WhatsApp con el texto armado; no envía nada solo.
export const textoInvitacion = (familia: string, url: string) => `Sumate a ${familia} en Agenda Divergente: ${url}`;

export const linkInvitacion = (familia: string, url: string) => `https://wa.me/?text=${encodeURIComponent(textoInvitacion(familia, url))}`;
