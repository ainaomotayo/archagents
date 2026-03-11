import type { FastifyInstance } from "fastify";

interface SamlMetadataOpts {
  entityId: string;
  acsUrl: string;
  orgName: string;
  signingCert?: string;
}

export function buildSamlMetadataXml(opts: SamlMetadataOpts): string {
  const keyDescriptor = opts.signingCert
    ? `
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${opts.signingCert}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${opts.entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${keyDescriptor}
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${opts.acsUrl}"
      index="0"
      isDefault="true" />
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">${opts.orgName}</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">${opts.orgName}</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${opts.entityId}</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;
}

export function registerSamlMetadataRoute(app: FastifyInstance) {
  app.get("/v1/saml/metadata", async (_request, reply) => {
    const baseUrl = process.env.SENTINEL_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const entityId = process.env.SAML_ENTITY_ID ?? baseUrl;
    const acsUrl = `${baseUrl}/api/auth/callback/saml-jackson`;
    const signingCert = process.env.SAML_SIGNING_CERT ?? undefined;

    const xml = buildSamlMetadataXml({
      entityId,
      acsUrl,
      orgName: "Sentinel",
      signingCert,
    });

    reply.type("application/xml").send(xml);
  });
}
