# Proveedores de facturación electrónica (DGI Uruguay)

La DGI **no ofrece una API pública directa** para que cualquier empresa emita CFEs.
El régimen de facturación electrónica se opera a través de **proveedores de
soluciones de software de CFE** (habilitados o no), con los siguientes pasos
oficiales (ver guía de ingreso al régimen):

1. Contactar con un proveedor de software de Factura Electrónica.
2. Adquirir un certificado digital (ABITAB, Correo Uruguayo o ANTEL).
3. Solicitar usuario para e-Factura en el portal de Servicios en línea de la DGI
   (roles Testing / Homologación / Homologación Simplificada).

Tipos de CFE previstos por el régimen: e-Ticket, e-Factura, notas de crédito y
notas de débito, entre otros definidos por la DGI.

Este directorio contiene los adaptadores a proveedores concretos. Cada adaptador
debe implementar `FiscalProvider`. La selección se realiza por configuración
(`DGI_PROVIDER`), sin modificar el módulo de ventas.

No se incluyen credenciales reales ni endpoints inventados. Los adaptadores deben
fallar de forma explícita cuando la configuración sea insuficiente.
