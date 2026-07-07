/**
 * Portal form request message — city-filled templates with wording variants.
 */
window.PortalRequestMessage = (() => {
  const CONTACT = {
    name: "Brandon Joseph Wunder",
    phone: "602-815-8040",
  };

  const VARIANTS = [
    (city) =>
      `Hi,

This is ${CONTACT.name} reaching out regarding code violations in ${city}. I'm seeking information on violations related to tall grass and trash/debris over the past 30 days for research purposes.

If there's a particular department handling these requests or any paperwork required, I'd appreciate being pointed in the right direction.

Thanks for your time. Feel free to contact me at ${CONTACT.phone} if needed.

Best,
${CONTACT.name}
${CONTACT.phone}`,

    (city) =>
      `Hello,

My name is ${CONTACT.name}, and I'm writing to request records related to code enforcement in ${city}. Specifically, I'm looking for violations involving tall grass and trash or debris from the last 30 days, for research use.

Please let me know which department processes these requests and whether any forms are needed.

Thank you. You can reach me at ${CONTACT.phone} with any questions.

Best regards,
${CONTACT.name}
${CONTACT.phone}`,

    (city) =>
      `Good afternoon,

I'm ${CONTACT.name}, contacting you about municipal code violations in ${city}. For a research project, I need information on tall-grass and trash/debris violations recorded within the past 30 days.

Could you direct me to the right office or let me know if specific paperwork is required?

I appreciate your help. My number is ${CONTACT.phone} if follow-up is needed.

Best,
${CONTACT.name}
${CONTACT.phone}`,

    (city) =>
      `Hi there,

${CONTACT.name} here — I'm requesting public information on code violations in ${city}, focusing on tall grass and trash/debris cases from the previous 30 days. This is for research purposes.

If a specific department handles these inquiries, or if there's required paperwork, I'd be grateful for guidance.

Thanks in advance. Please call ${CONTACT.phone} if you need anything from me.

Sincerely,
${CONTACT.name}
${CONTACT.phone}`,

    (city) =>
      `Dear Records Team,

I am ${CONTACT.name}, seeking code violation records for ${city}. My request covers tall grass and trash/debris violations from the last 30 days, needed for research.

Kindly advise which department manages these requests and whether any application forms apply.

Thank you for your assistance. I can be reached at ${CONTACT.phone}.

Respectfully,
${CONTACT.name}
${CONTACT.phone}`,

    (city) =>
      `Hello,

This message is from ${CONTACT.name} regarding code enforcement data in ${city}. I'm interested in violations tied to tall grass and accumulated trash or debris over the past 30 days, for academic research.

I'd appreciate a pointer to the correct department and any documentation I should submit.

Many thanks. ${CONTACT.phone} is the best number to reach me.

Warm regards,
${CONTACT.name}
${CONTACT.phone}`,
  ];

  function monthSeed(monthKey) {
    const text = String(monthKey || "default");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function defaultVariantIndex(monthKey) {
    return monthSeed(monthKey) % VARIANTS.length;
  }

  function buildMessage(cityName, variantIndex = 0) {
    const city = String(cityName || "").trim() || "this city";
    const idx = ((variantIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
    return VARIANTS[idx](city);
  }

  function nextVariantIndex(currentIndex) {
    return (currentIndex + 1) % VARIANTS.length;
  }

  return {
    VARIANT_COUNT: VARIANTS.length,
    buildMessage,
    defaultVariantIndex,
    nextVariantIndex,
  };
})();