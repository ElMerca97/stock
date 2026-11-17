import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { createClient, FunctionsFetchError, FunctionsHttpError, type User } from '@supabase/supabase-js'
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowUpRight, Bell, Boxes,
  ChevronDown, CircleHelp, ClipboardList, Hammer, History, Minus, Printer, Receipt,
  LayoutDashboard, LogOut, Mail, Moon, Package, Phone, Plus, Search, Settings, ShieldCheck,
  ShoppingBag, Sun, Trash2, Truck, UserRound, Users, X,
} from 'lucide-react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const configured = !!supabaseUrl && !!supabaseKey && !supabaseUrl.includes('TU-PROYECTO') && !supabaseKey.includes('TU_PUBLISHABLE')
const supabase = configured ? createClient(supabaseUrl!, supabaseKey!) : null

type Product = {
  id: string; sku: string; barcode: string | null; name: string; description: string | null
  category_id: string | null; supplier_id: string | null; unit: string; cost_price: number
  sale_price: number; stock_quantity: number; minimum_stock: number; is_active: boolean
  reserved: number; available: number // available = stock - units reserved by pending shipments
  categories?: { name: string } | null
}
type Employee = { id: string; auth_user_id: string | null; nombre: string; apellido: string; email: string; telefono?: string; rol: 'admin' | 'empleado'; activo: boolean; puede_movimientos: boolean; created_at: string }
type Supplier = { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null; is_active: boolean }
type HelpConfig = {
  help_email: string; help_phone: string; help_message: string
  business_name: string; business_rut: string; business_address: string; business_phone: string; ticket_footer: string
}
const defaultSettings: HelpConfig = {
  help_email: '', help_phone: '', help_message: 'Contactá al administrador de la ferretería para recibir ayuda.',
  business_name: 'Ferretería', business_rut: '', business_address: '', business_phone: '', ticket_footer: '¡Gracias por su compra!',
}
export type Sale = {
  id: number; sale_number: number; estado: string; status: 'completed' | 'cancelled' | 'draft'
  total: number; subtotal: number; discount_pct: number; discount_amount: number
  sold_at: string; customer_id: number | null; customers: { full_name: string }
  seller: string; business: Partial<{ name: string; rut: string; address: string; phone: string; footer: string }> | null
  items: { producto_nombre: string; producto_sku: string; cantidad: number; precio_unitario: number; subtotal: number }[]
}
const SALE_SELECT = 'id,estado,total,subtotal,descuento_porcentaje,descuento_importe,created_at,cliente_id,cliente_nombre_snapshot,receipt_business_snapshot,customers(nombre,apellido),profiles(nombre,apellido),shipment_items(producto_nombre,producto_sku,cantidad,precio_unitario,subtotal)'
function mapSale(s: any): Sale {
  const estado = String(s.estado ?? '').toLowerCase()
  return {
    id: s.id, sale_number: s.id, estado,
    status: ['entregado', 'completado', 'completed'].includes(estado) ? 'completed' : estado === 'cancelado' ? 'cancelled' : 'draft',
    total: Number(s.total ?? 0), subtotal: Number(s.subtotal ?? s.total ?? 0),
    discount_pct: Number(s.descuento_porcentaje ?? 0), discount_amount: Number(s.descuento_importe ?? 0),
    sold_at: s.created_at, customer_id: s.cliente_id,
    customers: { full_name: s.cliente_nombre_snapshot || [s.customers?.nombre, s.customers?.apellido].filter(Boolean).join(' ') || 'Consumidor final' },
    seller: [s.profiles?.nombre, s.profiles?.apellido].filter(Boolean).join(' '),
    business: s.receipt_business_snapshot ?? null,
    items: (s.shipment_items ?? []).map((i: any) => ({ ...i, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), subtotal: Number(i.subtotal) })),
  }
}
type Section = 'overview' | 'products' | 'sales' | 'history' | 'purchases' | 'customers' | 'suppliers' | 'employees' | 'profile' | 'settings'
const money = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 })
const fmtMoney = (n: number | string | null | undefined) => money.format(Number(n ?? 0))
const dateFmt = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const money2 = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMoney2 = (n: number | string | null | undefined) => money2.format(Number(n ?? 0))

// supabase.functions.invoke only reports "non-2xx status code"; the real message is in the response body.
async function functionErrorMessage(error: unknown) {
  if (error instanceof FunctionsFetchError) return 'No se pudo contactar la función de Supabase. Verificá que esté desplegada (npx supabase functions deploy admin-create-employee) y que haya conexión.'
  if (error instanceof FunctionsHttpError) {
    try { const body = await error.context.json(); if (body?.error) return String(body.error) } catch { /* body is not JSON */ }
  }
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  // undefined = session not checked yet (avoids flashing the login screen on reload)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [role, setRole] = useState<'admin' | 'staff' | null>(null)
  const [canMove, setCanMove] = useState(false)
  const [booting, setBooting] = useState(true)
  // Id of the user whose profile was already checked. Until it matches the signed-in user we show
  // the loading screen instead of "No se pudo habilitar tu perfil" (which used to flash on sign-in).
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [monthSales, setMonthSales] = useState<Sale[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [profileRecord, setProfileRecord] = useState<Employee | null>(null)
  const [helpConfig, setHelpConfig] = useState<HelpConfig>(defaultSettings)
  const [categories, setCategories] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setErrorRaw] = useState('')
  // Known database errors get a hint about what to do.
  const setError = (message: string) => setErrorRaw(
    message.includes('solo puede modificarse mediante register_stock_movement')
      ? `${message}. Falta aplicar supabase_migration_ventas.sql en Supabase (SQL Editor) o falló al ejecutarse.`
      : message)
  const [reloadKey, setReloadKey] = useState(0)
  // Reload all data. Clears the error unless the caller wants to keep one visible.
  const refresh = (keepError = false) => { if (!keepError) setError(''); setReloadKey(n => n + 1) }
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [employeeModal, setEmployeeModal] = useState(false)
  const [customerModal, setCustomerModal] = useState<any | null | false>(false)
  const [supplierModal, setSupplierModal] = useState<Supplier | null | false>(false)
  const [ticket, setTicket] = useState<Sale | null>(null)
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [stockModal, setStockModal] = useState<Product | null>(null)
  const [categoryModal, setCategoryModal] = useState(false)
  const [helpModal, setHelpModal] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [productFilter, setProductFilter] = useState<'all' | 'low' | 'inactive'>('all')
  const [success, setSuccess] = useState('')
  const [loginInfo, setLoginInfo] = useState('')
  useEffect(() => {
    if (!userMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUserMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userMenu])
  useEffect(() => { if (!success) return; const t = window.setTimeout(() => setSuccess(''), 3500); return () => window.clearTimeout(t) }, [success])
  // Reload data and show a short confirmation.
  const done = (message: string) => { refresh(); setSuccess(message) }
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('stockpro-theme') === 'dark' ? 'dark' : 'light')

  useEffect(() => {
    if (!supabase) { setBooting(false); return }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true); setUser(session?.user ?? null) })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('stockpro-theme', theme)
  }, [theme])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSection('products')
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.search-box input')?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  useEffect(() => {
    if (user === undefined) return
    if (!supabase || !user) { setBooting(false); setRole(null); return }
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('id,auth_user_id,rol,nombre,apellido,email,telefono,activo,puede_movimientos,created_at').eq('auth_user_id', user.id).maybeSingle(),
      supabase.from('products').select('*,categories(nombre)').is('deleted_at', null).order('nombre'),
      supabase.from('shipments').select(SALE_SELECT).order('created_at', { ascending: false }),
      supabase.from('shipments').select('estado,total,created_at').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase.from('purchase_orders').select('id,purchase_number,status,subtotal,ordered_at,suppliers(name),purchase_order_items(product_name,quantity,unit_cost,line_total)').order('ordered_at', { ascending: false }),
      supabase.from('customers').select('id,nombre,apellido,empresa,telefono,email,direccion,observaciones,descuento_porcentaje').is('deleted_at', null).order('nombre'),
      supabase.from('categories').select('id,nombre').eq('activo', true).order('nombre'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('profiles').select('id,auth_user_id,rol,nombre,apellido,email,telefono,activo,puede_movimientos,created_at').order('nombre'),
      supabase.from('ferreteria_settings').select('*').eq('id', 1).maybeSingle(),
    ]).then(([profile, productRows, saleRows, monthRows, purchaseRows, customerRows, categoryRows, supplierRows, employeeRows, settingsRows]) => {
      if (!active) return
      if (profile.error || !profile.data || !profile.data.activo) {
        setError(profile.error?.message || (!profile.data ? 'Tu usuario no está vinculado a un perfil. Pedile al administrador que aplique el SQL de vinculación.' : 'Tu cuenta está suspendida. Contactá a un administrador.'))
        setRole(null)
        setCanMove(false); setLoading(false); setBooting(false); setCheckedUserId(user.id)
        return
      }
      setRole(profile.data.rol === 'admin' ? 'admin' : 'staff')
      setCanMove(profile.data.rol === 'admin' || Boolean(profile.data.puede_movimientos))
      setProfileRecord(profile.data as Employee)
      const mapProduct = (p: any): Product => ({
        id: String(p.id), sku: p.sku ?? '', barcode: null, name: p.nombre,
        description: p.descripcion, category_id: p.categoria_id == null ? null : String(p.categoria_id), supplier_id: null,
        unit: p.tipo || 'unidad', cost_price: Number(p.precio_compra ?? 0), sale_price: Number(p.precio_venta ?? 0),
        stock_quantity: Number(p.stock ?? 0), minimum_stock: Number(p.stock_minimo ?? 0), is_active: p.activo,
        reserved: Number(p.stock_reservado ?? 0), available: Math.max(0, Number(p.stock ?? 0) - Number(p.stock_reservado ?? 0)),
        categories: p.categories ? { name: p.categories.nombre } : null,
      })
      if (productRows.error) setError(productRows.error.message); else setProducts((productRows.data ?? []).map(mapProduct))
      if (saleRows.error) setError(saleRows.error.message); else setSales((saleRows.data ?? []).map(mapSale))
      if (monthRows.error) setError(monthRows.error.message); else setMonthSales((monthRows.data ?? []).map(mapSale))
      if (purchaseRows.error) setError(purchaseRows.error.message); else setPurchases(purchaseRows.data ?? [])
      if (customerRows.error) setError(customerRows.error.message)
      if (!categoryRows.error) setCategories((categoryRows.data ?? []).map((c: any) => ({ id: String(c.id), name: c.nombre })))
      if (!customerRows.error) setCustomers((customerRows.data ?? []).map((c: any) => ({ ...c, full_name: [c.nombre, c.apellido].filter(Boolean).join(' ') || c.empresa || 'Cliente', company: c.empresa, phone: c.telefono, discount: Number(c.descuento_porcentaje ?? 0) })))
      if (supplierRows.error) setError(supplierRows.error.message); else setSuppliers(supplierRows.data ?? [])
      if (!employeeRows.error) setEmployees(employeeRows.data ?? [])
      if (!settingsRows.error && settingsRows.data) setHelpConfig({ ...defaultSettings, ...settingsRows.data })
      setLoading(false); setBooting(false); setCheckedUserId(user.id)
    }).catch((err: unknown) => {
      if (!active) return
      setError(`No se pudieron cargar los datos: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false); setBooting(false); setCheckedUserId(user.id)
    })
    return () => { active = false }
  }, [user === undefined ? 'checking' : user?.id ?? 'signed-out', reloadKey])

  const lowStock = useMemo(() => products.filter(p => p.is_active && Number(p.stock_quantity) <= Number(p.minimum_stock)), [products])
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return products.filter(p =>
      (productFilter === 'all' || (productFilter === 'low' ? p.is_active && p.stock_quantity <= p.minimum_stock : !p.is_active)) &&
      (!q || [p.name, p.sku, p.barcode, p.categories?.name].some(v => v?.toLocaleLowerCase().includes(q))))
  }, [products, query, productFilter])
  const monthTotal = monthSales.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.total), 0)

  async function signIn(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    setLoginBusy(true); setError(''); setLoginInfo('')
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) setError(error.message)
    setLoginBusy(false)
  }
  async function resetLoginPassword() {
    if (!supabase) return
    setLoginInfo('')
    if (!loginEmail.trim()) { setError('Ingresá tu correo para enviarte un enlace de recuperación.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), { redirectTo: `${window.location.origin}/` })
    if (error) setError(error.message)
    else { setError(''); setLoginInfo('Si la cuenta existe, te llegará un correo con un enlace para restablecer la contraseña.') }
  }
  async function signOut() { setUserMenu(false); setCheckedUserId(null); await supabase?.auth.signOut(); setUser(null); setRole(null); setProfileRecord(null); setSection('overview'); setError(''); setLoginPassword('') }
  async function saveProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || role !== 'admin') return
    const form = new FormData(e.currentTarget)
    const stockInput = Number(form.get('stock_quantity') || 0)
    const minimumStockInput = Number(form.get('minimum_stock') || 0)
    if (!Number.isInteger(stockInput) || stockInput < 0 || !Number.isInteger(minimumStockInput) || minimumStockInput < 0) { setError('El stock se registra en unidades enteras y no puede ser negativo.'); return }
    const requestedStock = stockInput
    const payload = {
      sku: String(form.get('sku')).trim(),
      nombre: String(form.get('name')).trim(), descripcion: String(form.get('description') || '').trim() || null,
      categoria_id: Number(form.get('category_id')) || null, tipo: String(form.get('unit') || 'unidad'),
      precio_compra: Number(form.get('cost_price') || 0), precio_venta: Number(form.get('sale_price') || 0),
      // editing keeps the current state; reactivating is an explicit action
      stock_minimo: Number(form.get('minimum_stock') || 0), activo: editing ? editing.is_active : true,
    }
    if (!payload.sku || !payload.nombre) { setError('Completá el nombre y el SKU.'); return }
    if (payload.precio_compra < 0 || payload.precio_venta < 0) { setError('Los precios no pueden ser negativos.'); return }
    const result = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload).select('id').single()
    if (result.error) { setError(result.error.message); return }
    const productId = editing ? Number(editing.id) : Number(result.data?.id)
    if (!productId) { setError('El producto se guardó, pero no se pudo confirmar su identificador para registrar el stock.'); return }
    const previousStock = editing ? Number(editing.stock_quantity) : 0
    if (requestedStock !== previousStock) {
      const movement = await supabase.rpc('register_stock_movement', { p_producto_id: productId, p_tipo: 'ajuste', p_cantidad: requestedStock, p_motivo: 'Stock inicial o ajuste desde catálogo', p_envio_id: null })
      if (movement.error) { setError(`Se guardó el producto, pero no se pudo actualizar el stock: ${movement.error.message}`); refresh(true); return }
    }
    setModal(false); setEditing(null); done(editing ? 'Producto actualizado.' : 'Producto creado.')
  }
  async function setProductActive(product: Product, active: boolean) {
    if (!supabase || role !== 'admin') return
    if (!active && !window.confirm(`¿Desactivar “${product.name}”? No se podrá vender hasta reactivarlo.`)) return
    const { error } = await supabase.from('products').update({ activo: active }).eq('id', product.id)
    if (error) setError(error.message); else done(active ? 'Producto reactivado.' : 'Producto desactivado.')
  }
  async function saveCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return
    const form = new FormData(e.currentTarget)
    const payload = { nombre: String(form.get('nombre')).trim(), apellido: String(form.get('apellido') || '').trim(), empresa: String(form.get('empresa') || '').trim(), telefono: String(form.get('telefono') || '').trim(), email: String(form.get('email') || '').trim(), direccion: String(form.get('direccion') || '').trim(), observaciones: String(form.get('observaciones') || '').trim(), descuento_porcentaje: Number(form.get('descuento_porcentaje') || 0) }
    if (!Number.isFinite(payload.descuento_porcentaje) || payload.descuento_porcentaje < 0 || payload.descuento_porcentaje > 100) { setError('El descuento del cliente debe estar entre 0 y 100 %.'); return }
    const current = customerModal && customerModal !== true ? customerModal : null
    const result = current ? await supabase.from('customers').update(payload).eq('id', current.id) : await supabase.from('customers').insert(payload)
    if (result.error) { setError(result.error.message); return }
    setCustomerModal(false); done(current ? 'Cliente actualizado.' : 'Cliente creado.')
  }
  async function archiveCustomer(c: any) {
    if (!supabase || role !== 'admin' || !window.confirm(`¿Archivar a ${c.full_name}?`)) return
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    if (error) setError(error.message); else done('Cliente archivado.')
  }
  async function saveSupplier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || role !== 'admin') return
    const f = new FormData(e.currentTarget)
    const payload = { name: String(f.get('name')).trim(), contact_name: String(f.get('contact_name') || '').trim() || null, phone: String(f.get('phone') || '').trim() || null, email: String(f.get('email') || '').trim() || null, address: String(f.get('address') || '').trim() || null, notes: String(f.get('notes') || '').trim() || null }
    const result = supplierModal ? await supabase.from('suppliers').update(payload).eq('id', supplierModal.id) : await supabase.from('suppliers').insert(payload)
    if (result.error) { setError(result.error.message); return }
    setSupplierModal(false); done(supplierModal ? 'Proveedor actualizado.' : 'Proveedor creado.')
  }
  async function toggleSupplier(s: Supplier) {
    if (!supabase || role !== 'admin') return
    const { error } = await supabase.from('suppliers').update({ is_active: !s.is_active }).eq('id', s.id)
    if (error) setError(error.message); else done(s.is_active ? 'Proveedor desactivado.' : 'Proveedor activado.')
  }
  async function createEmployee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || role !== 'admin') return
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.functions.invoke('admin-create-employee', { body: { nombre: String(f.get('nombre')).trim(), apellido: String(f.get('apellido') || '').trim(), email: String(f.get('email')).trim(), password: String(f.get('password')) } })
    if (error) { setError(await functionErrorMessage(error)); return }
    setEmployeeModal(false); done('Cuenta de empleado creada.')
  }
  async function deleteEmployee(employee: Employee) {
    if (!supabase || role !== 'admin') return
    // Prevent deleting own account
    if (employee.auth_user_id === user?.id || employee.id === profileRecord?.id) {
      setError('No podés borrar tu propia cuenta.');
      return
    }
    // Additional check: prevent deleting the last remaining admin
    // (a suspended admin does not count, so it can always be deleted)
    if (employee.rol === 'admin' && employee.activo) {
      const { count, error: countError } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('rol', 'admin').eq('activo', true)
      if (countError) { setError(countError.message); return }
      if ((count ?? 0) <= 1) { setError('No se puede borrar al último administrador activo. Asigná el rol de admin a otro usuario primero.'); return }
    }
    if (!window.confirm(`¿Borrar definitivamente a ${employee.nombre} ${employee.apellido} (${employee.email})? Se eliminarán sus credenciales y el acceso al sistema.`)) return
    // SQL function (supabase_migration_ventas.sql): works without deploying any Edge Function.
    const { error } = await supabase.rpc('ferreteria_delete_employee', { p_profile_id: employee.id })
    if (error) {
      setError(error.message.includes('ferreteria_delete_employee') ? 'Falta aplicar supabase_migration_ventas.sql en Supabase para poder borrar usuarios.' : error.message)
      return
    }
    done('Usuario borrado.')
  }
  async function updateEmployee(employee: Employee, patch: Partial<Employee>) {
    if (!supabase || role !== 'admin') return
    if (employee.auth_user_id === user?.id && (patch.rol === 'empleado' || patch.activo === false)) { setError('No podés quitarte el rol ni desactivar tu propia cuenta.'); return }
    const { error } = await supabase.from('profiles').update(patch).eq('id', employee.id)
    if (error) setError(error.message); else done('Permisos actualizados.')
  }
  // Returns true when the sale was registered; then opens its ticket.
  async function createSale(input: { customerId: number | null; discount: number; items: { product_id: number; quantity: number }[]; idempotencyKey: string }) {
    if (!supabase || !canMove) return false
    // The key is fixed per cart, so a retry after a network error never registers the sale twice.
    const { data: saleId, error } = await supabase.rpc('ferreteria_create_sale', { p_customer_id: input.customerId, p_items: input.items, p_discount_percent: input.discount, p_idempotency_key: input.idempotencyKey })
    if (error) { setError(error.message); return false }
    done(`Venta #${saleId} registrada.`)
    const { data: row, error: loadError } = await supabase.from('shipments').select(SALE_SELECT).eq('id', saleId).single()
    if (loadError) setError(`La venta #${saleId} se registró, pero no se pudo cargar el ticket: ${loadError.message}. Podés imprimirlo desde el historial.`)
    else setTicket(mapSale(row))
    return true
  }
  async function createPurchase(input: { supplierId: number | null; notes: string; items: { product_id: number; quantity: number; unit_cost: number }[] }) {
    if (!supabase || role !== 'admin') return
    const { error } = await supabase.rpc('ferreteria_create_purchase', { p_supplier_id: input.supplierId, p_notes: input.notes, p_items: input.items })
    if (error) { setError(error.message); return }
    setPurchaseModal(false); done('Compra creada como borrador.')
  }
  async function receivePurchase(purchase: any) {
    if (!supabase || role !== 'admin' || !window.confirm(`¿Recibir la compra #${purchase.purchase_number} y sumar sus unidades al stock?`)) return
    const { error } = await supabase.rpc('ferreteria_receive_purchase', { p_purchase_id: Number(purchase.id) })
    if (error) setError(error.message); else done('Compra recibida: el stock se actualizó.')
  }
  async function cancelPurchase(purchase: any) {
    if (!supabase || role !== 'admin' || !window.confirm(`¿Cancelar la compra #${purchase.purchase_number}? No modifica el stock.`)) return
    // Only drafts: a received purchase already moved stock.
    const { data, error } = await supabase.from('purchase_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', purchase.id).eq('status', 'draft').select('id')
    if (error) setError(error.message)
    else if (!data?.length) setError('La compra ya no está en borrador.')
    else done('Compra cancelada.')
  }
  async function saveStock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || !stockModal) return
    const f = new FormData(e.currentTarget)
    const type = String(f.get('movement_type'))
    const quantity = Number(f.get('quantity'))
    if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'ajuste' && quantity === 0)) { setError('Ingresá una cantidad entera válida. Entradas y salidas deben ser mayores a cero.'); return }
    const args = { p_producto_id: Number(stockModal.id), p_tipo: type, p_cantidad: quantity, p_motivo: String(f.get('reason') || '').trim() || 'Ajuste desde Nexora', p_envio_id: null }
    const { error } = await supabase.rpc('register_stock_movement', args)
    if (error) { setError(error.message); return }
    setStockModal(null); done('Movimiento de stock registrado.')
  }
  async function createCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || role !== 'admin') return
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('categories').insert({ nombre: String(f.get('name')).trim(), descripcion: String(f.get('description') || '').trim(), activo: true })
    if (error) { setError(error.message); return }
    setCategoryModal(false); done('Categoría creada.')
  }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || !profileRecord) return
    const f = new FormData(e.currentTarget)
    const payload = { nombre: String(f.get('nombre')).trim(), apellido: String(f.get('apellido') || '').trim(), telefono: String(f.get('telefono') || '').trim() }
    const { error } = await supabase.from('profiles').update(payload).eq('id', profileRecord.id)
    if (error) { setError(error.message); return }
    done('Perfil guardado.')
  }
  // Saves only the settings fields present in the submitted form (help contact or ticket data).
  async function saveSettings(e: FormEvent<HTMLFormElement>, message: string) {
    e.preventDefault(); if (!supabase || role !== 'admin' || !profileRecord) return
    const f = new FormData(e.currentTarget)
    const fields: Partial<HelpConfig> = {}
    for (const key of Object.keys(defaultSettings) as (keyof HelpConfig)[]) if (f.has(key)) fields[key] = String(f.get(key) || '').trim()
    if ('help_message' in fields && !fields.help_message) fields.help_message = defaultSettings.help_message
    if ('business_name' in fields && !fields.business_name) fields.business_name = defaultSettings.business_name
    const { error } = await supabase.from('ferreteria_settings').update({ ...fields, updated_by: profileRecord.id, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) { setError(error.message.includes('business_') ? 'Falta aplicar supabase_migration_ventas.sql en Supabase para guardar los datos del ticket.' : error.message); return }
    setHelpConfig(old => ({ ...old, ...fields })); done(message)
  }
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return
    const form = e.currentTarget; const f = new FormData(form); const password = String(f.get('password') || '')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message); else { setError(''); setSuccess('La contraseña se actualizó.'); form.reset() }
  }
  async function saveRecoveredPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return
    const f = new FormData(e.currentTarget); const password = String(f.get('password') || '')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); return }
    setRecoveryMode(false); refresh()
  }

  if (!supabase) return <SetupScreen />
  if (booting) return <div className="loading-screen"><div className="loader"/><span>Preparando tu espacio…</span></div>
  if (recoveryMode) return <RecoveryScreen onSubmit={saveRecoveredPassword} error={error} />
  if (!user) return <LoginScreen email={loginEmail} password={loginPassword} setEmail={setLoginEmail} setPassword={setLoginPassword} onSubmit={signIn} onReset={resetLoginPassword} busy={loginBusy} error={error} info={loginInfo} />
  if (checkedUserId !== user.id) return <div className="loading-screen"><div className="loader"/><span>Cargando tu perfil…</span></div>
  if (!role) return <AccessBlocked message={error} onSignOut={signOut} />

  const nav: { id: Section; label: string; icon: any }[] = [
    { id: 'overview' as const, label: 'Resumen', icon: LayoutDashboard },
    { id: 'products' as const, label: 'Productos', icon: Package },
    { id: 'sales' as const, label: 'Ventas', icon: ShoppingBag },
    { id: 'history' as const, label: 'Historial de ventas', icon: History },
    { id: 'purchases' as const, label: 'Compras', icon: ClipboardList },
    { id: 'customers' as const, label: 'Clientes', icon: Users },
  ]
  if (role === 'admin') nav.push({ id: 'suppliers' as const, label: 'Proveedores', icon: Truck })
  const adminNav: { id: Section; label: string; icon: any }[] = [
    ...(role === 'admin' ? [{ id: 'employees' as const, label: 'Empleados', icon: ShieldCheck }] : []),
    { id: 'profile' as const, label: 'Mi perfil', icon: UserRound },
    { id: 'settings' as const, label: 'Preferencias', icon: Settings },
  ]
  const go = (s: Section) => { setSection(s); setUserMenu(false) }
  const displayName = profileRecord?.nombre || user.email?.split('@')[0] || 'Usuario'
  const initial = (profileRecord?.nombre?.[0] || user.email?.[0] || 'U').toUpperCase()
  // While a modal is open the page-level alert is hidden behind the backdrop, so it floats above it.
  const anyModalOpen = modal || employeeModal || customerModal !== false || supplierModal !== false || !!ticket || purchaseModal || !!stockModal || categoryModal
  const titles: Record<Section, string> ={ overview: 'Resumen', products: 'Productos', sales: 'Ventas', purchases: 'Compras', customers: 'Clientes', suppliers: 'Proveedores', employees: 'Empleados', profile: 'Mi perfil', settings: 'Preferencias', history: 'Historial de ventas' }

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <div className="store-switch"><span className="store-avatar">L</span><span><b>Ferretería Lausana</b></span></div>
      <div className="nav-caption">MENÚ PRINCIPAL</div>
      <nav>{nav.map(item => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} title={item.label} onClick={() => go(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id === 'products' && lowStock.length > 0 && <em>{lowStock.length}</em>}</button>)}</nav>
      <div className="nav-caption tools-caption">CUENTA Y AJUSTES</div>
      {adminNav.map(item => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} title={item.label} onClick={() => go(item.id)}><item.icon size={18}/><span>{item.label}</span></button>)}
      <div className="sidebar-bottom"><button type="button" className="help-card" onClick={() => setHelpModal(true)}><span className="help-icon"><CircleHelp size={17}/></span><span><b>¿Necesitás ayuda?</b><small>Contactá al equipo</small></span><ArrowUpRight size={15}/></button><div className="user-menu"><div className="user-avatar">{initial}</div><div className="user-text"><b>{displayName}</b><small>{role === 'admin' ? 'Administrador' : 'Personal'}</small></div><button className="icon-button logout" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={17}/></button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">Ferretería <span>/</span> <b>{titles[section]}</b></div><div className="top-actions"><span className="today">{dateFmt.format(new Date())}</span><button className="icon-button notification" aria-label="Ver productos con stock bajo" title={lowStock.length ? `${lowStock.length} productos con stock bajo` : 'Sin alertas de stock'} onClick={() => { setProductFilter('low'); setQuery(''); go('products') }}><Bell size={18}/>{lowStock.length > 0 && <i/>}</button>
        <div className="top-user-wrap"><button className="top-user" aria-haspopup="menu" aria-expanded={userMenu} title="Menú de usuario" onClick={() => setUserMenu(v => !v)}><div className="user-avatar small">{initial}</div><ChevronDown size={15}/></button>
          {userMenu && <><div className="menu-overlay" onClick={() => setUserMenu(false)}/><div className="dropdown-menu" role="menu"><div className="dropdown-head"><b>{displayName}</b><small>{user.email}</small></div><button role="menuitem" onClick={() => go('profile')}><UserRound size={15}/> Mi perfil</button><button role="menuitem" onClick={() => go('settings')}><Settings size={15}/> Preferencias</button><button role="menuitem" onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setUserMenu(false) }}>{theme === 'dark' ? <Sun size={15}/> : <Moon size={15}/>} {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}</button><button role="menuitem" className="danger-text" onClick={signOut}><LogOut size={15}/> Cerrar sesión</button></div></>}
        </div></div></header>
      <div className="page-content">
        {error && <div className={`alert error-alert ${anyModalOpen ? 'floating-alert' : ''}`} role="alert"><Activity size={17}/><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
        {loading && <div className="sync-line"><span className="sync-dot"/>Actualizando datos…</div>}
        {section === 'overview' && <Overview products={products} sales={sales} customers={customers} lowStock={lowStock} monthTotal={monthTotal} monthSales={monthSales} setSection={go} canSell={canMove} onNewSale={() => go('sales')} onShowLow={() => { setProductFilter('low'); setQuery(''); go('products') }} />}
        {section === 'products' && <Products products={filteredProducts} total={products.length} query={query} setQuery={setQuery} filter={productFilter} setFilter={setProductFilter} canEdit={role === 'admin'} canStock={canMove} onNew={() => {setEditing(null);setModal(true)}} onEdit={(p: Product) => {setEditing(p);setModal(true)}} onStock={setStockModal} onSetActive={setProductActive} onNewCategory={() => setCategoryModal(true)} />}
        {section === 'sales' && <SalesPOS products={products.filter(p => p.is_active)} customers={customers} canSell={canMove} onSell={createSale} onHistory={() => go('history')} />}
        {section === 'history' && <SalesHistory sales={sales} onTicket={setTicket} onNewSale={canMove ? () => go('sales') : undefined} />}
        {section === 'purchases' && <Records title="Compras" eyebrow="ABASTECIMIENTO" icon={<Truck size={20}/>} items={purchases} kind="purchase" canCreate={role === 'admin'} onCreate={() => setPurchaseModal(true)} onReceive={receivePurchase} onCancel={cancelPurchase} />}
        {section === 'customers' && <Customers customers={customers} canEdit={!!role} isAdmin={role === 'admin'} onNew={() => setCustomerModal(true)} onEdit={(c: any) => setCustomerModal(c)} onArchive={archiveCustomer} />}
        {section === 'suppliers' && role === 'admin' && <Suppliers suppliers={suppliers} onNew={() => setSupplierModal(null)} onEdit={(s: Supplier) => setSupplierModal(s)} onToggle={toggleSupplier} />}
        {section === 'employees' && role === 'admin' && <Employees employees={employees} currentUserId={user.id} currentProfileId={profileRecord?.id} onNew={() => setEmployeeModal(true)} onUpdate={updateEmployee} onDelete={deleteEmployee} />}
        {section === 'profile' && profileRecord && <ProfileView profile={profileRecord} onSave={saveProfile} onPasswordChange={changePassword} />}
        {section === 'settings' && <Integrations theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} isAdmin={role === 'admin'} helpConfig={helpConfig} onSaveHelp={(e: FormEvent<HTMLFormElement>) => saveSettings(e, 'Contacto de ayuda guardado.')} onSaveBusiness={(e: FormEvent<HTMLFormElement>) => saveSettings(e, 'Datos del ticket guardados.')} />}
      </div>
    </main>
    {modal && <ProductModal item={editing} categories={categories} onClose={() => {setModal(false);setEditing(null)}} onSave={saveProduct} />}
    {employeeModal && <EmployeeModal onClose={() => setEmployeeModal(false)} onSave={createEmployee} />}
    {customerModal !== false && <CustomerModal item={customerModal === true ? null : customerModal} onClose={() => setCustomerModal(false)} onSave={saveCustomer} />}
    {supplierModal !== false && <SupplierModal item={supplierModal} onClose={() => setSupplierModal(false)} onSave={saveSupplier} />}
    {ticket && <TicketModal sale={ticket} settings={helpConfig} onClose={() => setTicket(null)} />}
    {purchaseModal && <PurchaseModal products={products.filter(p => p.is_active)} suppliers={suppliers.filter(s => s.is_active)} onClose={() => setPurchaseModal(false)} onSave={createPurchase} />}
    {stockModal && <StockModal product={stockModal} isAdmin={role === 'admin'} onClose={() => setStockModal(null)} onSave={saveStock} />}
    {categoryModal && <CategoryModal onClose={() => setCategoryModal(false)} onSave={createCategory} />}
    {helpModal && <HelpModal config={helpConfig} onClose={() => setHelpModal(false)} />}
    {success && <div className="toast" role="status"><ShieldCheck size={16}/><span>{success}</span><button aria-label="Cerrar aviso" onClick={() => setSuccess('')}><X size={14}/></button></div>}
  </div>
}

// Nexora brand: emblem (public/brand/nexora-mark.png, cut from the original logo) + wordmark.
function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'light' : ''}`}><img className="brand-mark" src="/brand/nexora-mark.png" alt="" width={46} height={26}/><span className="brand-word">NE<span className="brand-x">X</span>ORA</span></div>
}
function AccessBlocked({ message, onSignOut }: any) { return <div className="setup-screen"><div className="setup-card"><div className="setup-mark"><ShieldCheck size={21}/></div><span className="eyebrow">ACCESO A NEXORA</span><h1>No se pudo habilitar tu perfil</h1><p>{message || 'Tu cuenta no tiene un perfil activo en esta ferretería.'}</p><button className="primary-button" onClick={onSignOut}>Cerrar sesión<LogOut size={16}/></button></div></div> }
function RecoveryScreen({ onSubmit, error }: any) { return <div className="setup-screen"><form className="setup-card" onSubmit={onSubmit}><div className="setup-mark"><ShieldCheck size={21}/></div><span className="eyebrow">RECUPERACIÓN DE CUENTA</span><h1>Elegí una nueva contraseña</h1><p>La contraseña debe tener al menos 10 caracteres.</p>{error && <div className="alert error-alert">{error}</div>}<label className="recovery-label">Nueva contraseña<input name="password" type="password" minLength={10} autoComplete="new-password" required/></label><button className="primary-button" type="submit">Guardar contraseña<ArrowUpRight size={16}/></button></form></div> }
function SetupScreen() {
  return <div className="setup-screen"><div className="setup-card"><div className="setup-mark"><Hammer size={21}/></div><span className="eyebrow">NEXORA · CONFIGURACIÓN</span><h1>Conectemos tu ferretería</h1><p>La app necesita los datos de tu proyecto Supabase para iniciar.</p><ol><li>Copiá <code>.env.example</code> como <code>.env.local</code>.</li><li>Completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</li><li>Reiniciá el servidor de desarrollo.</li></ol><div className="setup-note"><ShieldCheck size={17}/><span>Usá la clave publicable/anon. Nunca pongas la service_role key en el navegador.</span></div><div className="setup-footer">¿La DGI? La integración queda preparada para más adelante, cuando publiquen su API.</div></div></div>
}
function LoginScreen({ email, password, setEmail, setPassword, onSubmit, onReset, busy, error, info }: any) {
  return <div className="login-screen"><div className="login-aside"><Brand light/><div className="login-promo"><span className="eyebrow">TODO BAJO CONTROL</span><h1>Tu negocio,<br/>bien organizado.</h1><p>Stock, ventas y compras en un solo lugar.</p><div className="promo-stat"><span><Boxes size={17}/></span><div><b>Gestión simple</b><small>Tomá mejores decisiones con información clara.</small></div></div></div><div className="login-aside-foot">Nexora · Ferretería Lausana</div></div><div className="login-main"><form className="login-form" onSubmit={onSubmit}><span className="eyebrow">BIENVENIDO DE NUEVO</span><h2>Iniciar sesión</h2><p>Ingresá con el usuario creado en Supabase Auth.</p>{error && <div className="alert error-alert">{error}</div>}{info && <div className="alert info-alert">{info}</div>}<label>Correo electrónico<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vos@ferreteria.com" required autoComplete="email"/></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" required autoComplete="current-password"/></label><button className="primary-button full-button" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}<ArrowUpRight size={17}/></button><button className="forgot-button" type="button" onClick={onReset}>Olvidé mi contraseña</button><div className="login-help"><ShieldCheck size={16}/> Acceso protegido por Supabase Auth</div></form><div className="login-copyright">© {new Date().getFullYear()} Nexora · Ferretería Lausana</div></div></div>
}

function PageHeading({ eyebrow, title, description, action }: any) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div> }
function SalesPOS({ products, customers, canSell, onSell, onHistory }: { products: Product[]; customers: any[]; canSell: boolean; onSell: (input: { customerId: number | null; discount: number; items: { product_id: number; quantity: number }[]; idempotencyKey: string }) => Promise<boolean>; onHistory: () => void }) {
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // Same payload => same idempotency key, so retrying after a network error never duplicates the sale.
  const lastAttempt = useRef<{ payload: string; key: string } | null>(null)
  useEffect(() => { searchRef.current?.focus() }, [])

  const results = useMemo(() => products.filter(p => matches(query, p.name, p.sku, p.categories?.name)).slice(0, 60), [products, query])
  const inCart = (id: string) => cart.find(l => l.product.id === id)?.quantity ?? 0
  const add = (p: Product, n = 1) => {
    if (inCart(p.id) + n > p.available) { setMessage(`Stock insuficiente para ${p.name}: hay ${p.available} ${p.unit} disponibles.`); return }
    setMessage('')
    setCart(old => old.some(l => l.product.id === p.id) ? old.map(l => l.product.id === p.id ? { ...l, quantity: l.quantity + n } : l) : [...old, { product: p, quantity: n }])
  }
  const setQty = (p: Product, value: number) => {
    if (!Number.isInteger(value) || value < 1) return
    if (value > p.available) { setMessage(`Solo hay ${p.available} ${p.unit} disponibles de ${p.name}.`); value = p.available }
    else setMessage('')
    setCart(old => old.map(l => l.product.id === p.id ? { ...l, quantity: value } : l))
  }
  const remove = (id: string) => setCart(old => old.filter(l => l.product.id !== id))
  const selectedCustomer = customers.find((c: any) => String(c.id) === customerId)
  const chooseCustomer = (id: string) => { setCustomerId(id); const c = customers.find((x: any) => String(x.id) === id); setDiscount(String(c?.discount ?? 0)) }
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Exact SKU first (barcode scanners type the code + Enter), otherwise the first result.
    const exact = products.find(p => p.sku.toLocaleLowerCase() === query.trim().toLocaleLowerCase())
    const target = exact ?? (results.length === 1 || query.trim() ? results[0] : undefined)
    if (target) { add(target); setQuery('') }
  }

  const subtotal = cart.reduce((sum, l) => sum + l.product.sale_price * l.quantity, 0)
  const pct = Number(discount)
  const pctValid = Number.isFinite(pct) && pct >= 0 && pct <= 100
  const discountAmount = pctValid ? Math.round(subtotal * pct) / 100 : 0
  const units = cart.reduce((sum, l) => sum + l.quantity, 0)

  const checkout = async () => {
    if (!cart.length) { setMessage('Agregá al menos un producto.'); return }
    if (!pctValid) { setMessage('El descuento debe estar entre 0 y 100 %.'); return }
    const input = { customerId: Number(customerId) || null, discount: pct, items: cart.map(l => ({ product_id: Number(l.product.id), quantity: l.quantity })) }
    const payload = JSON.stringify(input)
    if (lastAttempt.current?.payload !== payload) lastAttempt.current = { payload, key: crypto.randomUUID() }
    setBusy(true); setMessage('')
    try {
      const ok = await onSell({ ...input, idempotencyKey: lastAttempt.current.key })
      if (ok) { setCart([]); setDiscount('0'); setCustomerId(''); lastAttempt.current = null; searchRef.current?.focus() }
    } finally { setBusy(false) }
  }
  const clear = () => { if (!cart.length || window.confirm('¿Vaciar la venta actual?')) { setCart([]); setDiscount('0'); setMessage('') } }

  if (!canSell) return <><PageHeading eyebrow="CAJA" title="Ventas" description="Registrá ventas y emití el ticket."/><div className="info-banner"><ShieldCheck size={17}/><span>Tu usuario no tiene permiso para registrar ventas. Pedile a un administrador que lo habilite en Empleados.</span></div><button className="outline-button" onClick={onHistory}><History size={16}/> Ver historial de ventas</button></>

  return <>
    <PageHeading eyebrow="CAJA" title="Ventas" description="Buscá productos, armá la venta y cobrá. Al confirmar se descuenta el stock y se genera el ticket." action={<button className="outline-button" onClick={onHistory}><History size={16}/> Historial de ventas</button>}/>
    <div className="pos-grid">
      <section className="panel pos-catalog">
        <div className="list-toolbar"><div className="search-box pos-search"><Search size={17}/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder="Buscá por nombre o escaneá el código (SKU)…" aria-label="Buscar producto para vender"/>{query && <button type="button" className="clear-search" aria-label="Borrar búsqueda" onClick={() => { setQuery(''); searchRef.current?.focus() }}><X size={14}/></button>}</div><span className="result-count">Enter agrega el primero</span></div>
        <div className="pos-products">
          {results.map(p => { const left = p.available - inCart(p.id); return <button type="button" key={p.id} className="pos-product" disabled={left <= 0} onClick={() => add(p)}>
            <span className="product-square"><Package size={16}/></span>
            <span className="pos-product-name"><b>{p.name}</b><small>{p.sku}{p.categories?.name ? ` · ${p.categories.name}` : ''}</small></span>
            <span className={`pos-stock ${left <= 0 ? 'out' : p.available <= p.minimum_stock ? 'low' : ''}`}>{left <= 0 ? 'Sin stock' : `${left} disp.`}</span>
            <span className="pos-price">{fmtMoney2(p.sale_price)}</span>
            <span className="pos-add" aria-hidden="true"><Plus size={15}/></span>
          </button> })}
          {!results.length && <EmptyState text={products.length ? 'Ningún producto coincide con la búsqueda.' : 'No hay productos activos para vender.'}/>}
        </div>
      </section>
      <section className="panel pos-cart" aria-label="Venta actual">
        <div className="panel-heading"><div className="record-title-icon"><Receipt size={19}/><h2>Venta actual</h2></div><span className="result-count">{units} {units === 1 ? 'artículo' : 'artículos'}</span></div>
        <div className="pos-cart-body">
          <label className="pos-field">Cliente<select value={customerId} onChange={e => chooseCustomer(e.target.value)}><option value="">Consumidor final</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}{c.discount > 0 ? ` · ${c.discount} % desc.` : ''}</option>)}</select></label>
          {selectedCustomer?.discount > 0 && <p className="pos-note">Descuento fijo de {selectedCustomer.full_name}: <b>{selectedCustomer.discount} %</b> (aplicado)</p>}
          <div className="pos-lines">
            {cart.length ? cart.map(l => <div className="pos-line" key={l.product.id}>
              <div className="pos-line-name"><b>{l.product.name}</b><small>{fmtMoney2(l.product.sale_price)} c/u</small></div>
              <div className="qty-stepper"><button type="button" aria-label={`Restar uno de ${l.product.name}`} onClick={() => l.quantity > 1 ? setQty(l.product, l.quantity - 1) : remove(l.product.id)}><Minus size={13}/></button><input type="number" min="1" step="1" value={l.quantity} aria-label={`Cantidad de ${l.product.name}`} onChange={e => setQty(l.product, Number(e.target.value))}/><button type="button" aria-label={`Sumar uno de ${l.product.name}`} onClick={() => add(l.product)}><Plus size={13}/></button></div>
              <b className="pos-line-total">{fmtMoney2(l.product.sale_price * l.quantity)}</b>
              <button type="button" className="icon-button pos-remove" aria-label={`Quitar ${l.product.name}`} title="Quitar" onClick={() => remove(l.product.id)}><Trash2 size={15}/></button>
            </div>) : <div className="pos-empty"><ShoppingBag size={22}/><span>Tocá un producto de la lista para agregarlo.</span></div>}
          </div>
          {message && <p className="form-error" role="alert">{message}</p>}
          <div className="pos-totals">
            <div><span>Subtotal</span><b>{fmtMoney2(subtotal)}</b></div>
            <div className="pos-discount"><label htmlFor="pos-discount">Descuento %</label><input id="pos-discount" type="number" min="0" max="100" step="0.5" value={discount} onChange={e => setDiscount(e.target.value)}/><b>{discountAmount ? `− ${fmtMoney2(discountAmount)}` : '—'}</b></div>
            <div className="pos-grand"><span>Total</span><b>{fmtMoney2(subtotal - discountAmount)}</b></div>
          </div>
          <button type="button" className="primary-button full-button pos-checkout" disabled={busy || !cart.length} onClick={checkout}><Receipt size={17}/>{busy ? 'Registrando…' : 'Cobrar y generar ticket'}</button>
          <button type="button" className="text-button pos-clear" disabled={busy || !cart.length} onClick={clear}>Vaciar venta</button>
        </div>
      </section>
    </div>
  </>
}

function SalesHistory({ sales, onTicket, onNewSale }: { sales: Sale[]; onTicket: (s: Sale) => void; onNewSale?: () => void }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<'all' | 'completed' | 'draft' | 'cancelled'>('all')
  const [limit, setLimit] = useState(50)
  const shown = sales.filter(s =>
    (status === 'all' || s.status === status) &&
    (!from || new Date(s.sold_at) >= new Date(`${from}T00:00:00`)) &&
    (!to || new Date(s.sold_at) <= new Date(`${to}T23:59:59.999`)) &&
    matches(query, s.sale_number, s.customers.full_name, s.seller, ...s.items.map(i => i.producto_nombre)))
  const completed = shown.filter(s => s.status === 'completed')
  const totalSold = completed.reduce((sum, s) => sum + s.total, 0)
  const filtering = !!(query || from || to || status !== 'all')
  const reset = () => { setQuery(''); setFrom(''); setTo(''); setStatus('all') }
  return <>
    <PageHeading eyebrow="MOVIMIENTOS" title="Historial de ventas" description="Consultá las ventas registradas y reimprimí sus tickets." action={onNewSale ? <button className="primary-button" onClick={onNewSale}><Plus size={17}/> Nueva venta</button> : null}/>
    <div className="history-stats">
      <div className="stat-card"><div className="stat-top"><span>Ventas completadas</span></div><div className="stat-value">{completed.length.toLocaleString('es-UY')}</div><div className="stat-foot"><span>{filtering ? 'Con los filtros aplicados' : 'En total'}</span></div></div>
      <div className="stat-card"><div className="stat-top"><span>Total vendido</span></div><div className="stat-value">{fmtMoney(totalSold)}</div><div className="stat-foot"><span>Solo ventas completadas</span></div></div>
      <div className="stat-card"><div className="stat-top"><span>Ticket promedio</span></div><div className="stat-value">{fmtMoney(completed.length ? totalSold / completed.length : 0)}</div><div className="stat-foot"><span>Por venta completada</span></div></div>
    </div>
    <div className="panel record-panel">
      <div className="history-filters">
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar por N°, cliente, vendedor o producto…"/>
        <label>Desde<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}/></label>
        <label>Hasta<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}/></label>
        <label>Estado<select value={status} onChange={e => setStatus(e.target.value as any)}><option value="all">Todos</option><option value="completed">Completadas</option><option value="draft">En proceso</option><option value="cancelled">Canceladas</option></select></label>
        {filtering && <button type="button" className="text-button" onClick={reset}>Limpiar filtros</button>}
        <span className="result-count">{shown.length} de {sales.length} ventas</span>
      </div>
      {shown.length ? <div className="table-wrap"><table><thead><tr><th>N°</th><th>FECHA</th><th>CLIENTE</th><th>VENDEDOR</th><th>ARTÍCULOS</th><th>ESTADO</th><th className="align-right">TOTAL</th><th/></tr></thead><tbody>{shown.slice(0, limit).map(s => <tr key={s.id}>
        <td><b className="mono">#{s.sale_number}</b></td>
        <td>{dateTimeFmt.format(new Date(s.sold_at))}</td>
        <td>{s.customers.full_name}</td>
        <td>{s.seller || '—'}</td>
        <td>{s.items.reduce((n, i) => n + i.cantidad, 0)}</td>
        <td><span className={`status ${s.status}`}>{saleStatusLabel(s)}</span></td>
        <td className="align-right amount">{fmtMoney2(s.total)}</td>
        <td className="row-actions"><button className="quiet-button ticket-button" onClick={() => onTicket(s)}><Receipt size={13}/> Ticket</button></td>
      </tr>)}</tbody></table>{shown.length > limit && <div className="load-more"><button className="outline-button" onClick={() => setLimit(n => n + 50)}>Mostrar 50 más</button></div>}</div> : <EmptyState text={sales.length ? 'Ninguna venta coincide con los filtros.' : 'Aún no hay ventas registradas.'}/>}
    </div>
  </>
}

function Ticket({ sale, settings }: { sale: Sale; settings: HelpConfig }) {
  // Prefer the business data saved with the sale (what was valid that day).
  const b = sale.business ?? {}
  const business = { name: b.name || settings.business_name, rut: b.rut ?? settings.business_rut, address: b.address ?? settings.business_address, phone: b.phone ?? settings.business_phone, footer: b.footer ?? settings.ticket_footer }
  return <article className="ticket-sheet">
    <header className="ticket-head">
      <div className="ticket-business"><h1>{business.name}</h1>{business.rut && <p>RUT {business.rut}</p>}{business.address && <p>{business.address}</p>}{business.phone && <p>Tel. {business.phone}</p>}</div>
      <div className="ticket-id"><span>TICKET DE VENTA</span><b>N° {String(sale.sale_number).padStart(6, '0')}</b><span>{dateTimeFmt.format(new Date(sale.sold_at))}</span></div>
    </header>
    <section className="ticket-meta">
      <div><span>Cliente</span><b>{sale.customers.full_name}</b></div>
      {sale.seller && <div><span>Atendido por</span><b>{sale.seller}</b></div>}
      {sale.status !== 'completed' && <div><span>Estado</span><b>{saleStatusLabel(sale)}</b></div>}
    </section>
    <table className="ticket-table"><thead><tr><th>Código</th><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unitario</th><th className="num">Importe</th></tr></thead>
      <tbody>{sale.items.map((i, n) => <tr key={n}><td className="code">{i.producto_sku || '—'}</td><td>{i.producto_nombre}</td><td className="num">{i.cantidad}</td><td className="num">{fmtMoney2(i.precio_unitario)}</td><td className="num">{fmtMoney2(i.subtotal)}</td></tr>)}</tbody>
    </table>
    <div className="ticket-totals">
      <div><span>Subtotal</span><span>{fmtMoney2(sale.subtotal)}</span></div>
      {sale.discount_amount > 0 && <div><span>Descuento ({sale.discount_pct} %)</span><span>− {fmtMoney2(sale.discount_amount)}</span></div>}
      <div className="ticket-grand"><span>TOTAL</span><span>{fmtMoney2(sale.total)}</span></div>
    </div>
    <footer className="ticket-foot">{business.footer && <p className="ticket-thanks">{business.footer}</p>}<p>Documento no válido como comprobante fiscal.</p></footer>
  </article>
}

function TicketModal({ sale, settings, onClose }: { sale: Sale; settings: HelpConfig; onClose: () => void }) {
  useEscape(onClose)
  const print = () => {
    // The file name suggested when "printing" to PDF comes from the page title.
    const previous = document.title
    document.title = `Ticket-${String(sale.sale_number).padStart(6, '0')}`
    window.addEventListener('afterprint', () => { document.title = previous }, { once: true })
    window.print()
  }
  return <>
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="product-modal ticket-modal" role="dialog" aria-modal="true" aria-label={`Ticket de la venta ${sale.sale_number}`}>
        <div className="modal-heading"><div><span className="eyebrow">VENTA #{sale.sale_number}</span><h2>Ticket</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></div>
        <div className="ticket-preview"><Ticket sale={sale} settings={settings}/></div>
        <div className="modal-actions"><span className="ticket-hint">Hoja A4 · impresora láser</span><button className="outline-button" type="button" onClick={onClose}>Cerrar</button><button className="primary-button" type="button" onClick={print} autoFocus><Printer size={16}/> Imprimir</button></div>
      </div>
    </div>
    {createPortal(<div className="print-sheet"><Ticket sale={sale} settings={settings}/></div>, document.body)}
  </>
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches' }
function saleStatusLabel(s: any) {
  if (s.status === 'completed') return 'Completada'
  if (s.status === 'cancelled') return 'Cancelada'
  // Shipments from Control de Stock can have other states (pendiente, en camino…): show them as they are.
  const raw = String(s.estado || 'pendiente').replace(/_/g, ' ')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="search-box"><Search size={17}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value && <button type="button" className="clear-search" aria-label="Borrar búsqueda" onClick={() => onChange('')}><X size={14}/></button>}</div>
}
const matches = (q: string, ...values: unknown[]) => { const t = q.trim().toLocaleLowerCase(); return !t || values.some(v => v != null && String(v).toLocaleLowerCase().includes(t)) }

function Overview({ products, sales, customers, lowStock, monthTotal, monthSales, setSection, canSell, onNewSale, onShowLow }: any) {
  const recent = [...sales].slice(0, 5)
  const completed = monthSales.filter((s: any) => s.status === 'completed').length
  return <>
    <PageHeading eyebrow="VISTA GENERAL" title={`${greeting()} 👋`} description="Así se mueve tu ferretería. Acá tenés el resumen de hoy." action={canSell ? <button className="primary-button" onClick={onNewSale}><Plus size={17}/> Nueva venta</button> : <button className="outline-button" onClick={() => setSection('products')}><Package size={16}/> Ver productos</button>} />
    <div className="stat-grid">
      <StatCard label="Ventas del mes" value={fmtMoney(monthTotal)} foot={`${completed} ${completed === 1 ? 'venta completada' : 'ventas completadas'}`} icon={<ShoppingBag size={18}/>} tint="orange" trend={<><ArrowUpRight size={14}/> Este mes</>} onClick={() => setSection('sales')} />
      <StatCard label="Productos activos" value={products.filter((p: Product) => p.is_active).length.toLocaleString('es-UY')} foot="En el catálogo" icon={<Package size={18}/>} tint="blue" trend={<><Activity size={13}/> Catálogo</>} onClick={() => setSection('products')} />
      <StatCard label="Stock bajo" value={lowStock.length.toLocaleString('es-UY')} foot="Productos en mínimo o menos" icon={<Boxes size={18}/>} tint="red" trend={<><ArrowDownRight size={14}/> Revisar</>} onClick={onShowLow} />
      <StatCard label="Clientes" value={customers.length.toLocaleString('es-UY')} foot="En el directorio" icon={<Users size={18}/>} tint="green" trend={<><ArrowUpRight size={14}/> En cartera</>} onClick={() => setSection('customers')} />
    </div>
    <div className="content-grid">
      <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Ventas recientes</h2></div><button className="text-button" onClick={() => setSection('sales')}>Ver todas <ArrowUpRight size={15}/></button></div>
        {recent.length ? <div className="table-wrap"><table><thead><tr><th>VENTA</th><th>CLIENTE</th><th>FECHA</th><th>ESTADO</th><th className="align-right">TOTAL</th></tr></thead><tbody>{recent.map((s: any) => <tr key={s.id}><td><b className="mono">#{s.sale_number}</b></td><td>{s.customers?.full_name || 'Venta mostrador'}</td><td>{dateFmt.format(new Date(s.sold_at))}</td><td><span className={`status ${s.status}`}>{saleStatusLabel(s)}</span></td><td className="align-right amount">{fmtMoney(s.total)}</td></tr>)}</tbody></table></div> : <EmptyState text="Todavía no hay ventas para mostrar." />}
      </section>
      <section className="panel stock-panel"><div className="panel-heading"><div><span className="eyebrow">ATENCIÓN</span><h2>Stock por reponer</h2></div><span className="count-pill">{lowStock.length}</span></div>{lowStock.length ? <div className="stock-list">{lowStock.slice(0, 5).map((p: Product) => <div className="stock-row" key={p.id}><div className="product-square"><Package size={16}/></div><div className="stock-name"><b>{p.name}</b><small>{p.sku}</small></div><div className="stock-count"><b>{p.stock_quantity}</b><small>mín. {p.minimum_stock} {p.unit}</small></div></div>)}</div> : <EmptyState text="¡Todo en orden! No hay productos bajo el mínimo." />}<button className="secondary-button full-button" onClick={lowStock.length ? onShowLow : () => setSection('products')}>{lowStock.length ? 'Ver todos los de stock bajo' : 'Ir al inventario'} <ArrowUpRight size={16}/></button></section>
    </div>
    <div className="quick-actions"><div className="quick-label"><span className="eyebrow">ATAJOS</span><h3>¿Qué necesitás hacer?</h3></div><button onClick={() => setSection('products')}><span className="quick-icon orange"><Package size={18}/></span><span><b>Gestionar productos</b><small>Agregar o actualizar artículos</small></span><ArrowUpRight size={16}/></button><button onClick={canSell ? onNewSale : () => setSection('sales')}><span className="quick-icon blue">{canSell ? <Plus size={18}/> : <ClipboardList size={18}/>}</span><span><b>{canSell ? 'Registrar venta' : 'Revisar ventas'}</b><small>{canSell ? 'Abrir la caja' : 'Consultar movimientos'}</small></span><ArrowUpRight size={16}/></button><button onClick={() => setSection('purchases')}><span className="quick-icon green"><Truck size={18}/></span><span><b>Ver compras</b><small>Órdenes a proveedores</small></span><ArrowUpRight size={16}/></button></div>
  </>
}
function StatCard({ label, value, foot, icon, tint, trend, onClick }: any) { return <button type="button" className="stat-card" onClick={onClick}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}>{icon}</span></div><div className="stat-value">{value}</div><div className="stat-foot"><span>{foot}</span><span className={`trend ${tint}`}>{trend}</span></div></button> }

function Products({ products, total, query, setQuery, filter, setFilter, canEdit, canStock, onNew, onEdit, onStock, onSetActive, onNewCategory }: any) {
  return <><PageHeading eyebrow="CATÁLOGO E INVENTARIO" title="Productos" description="Controlá precios, disponibilidad y niveles de stock." action={canEdit ? <div className="heading-actions"><button className="outline-button" onClick={onNewCategory}><Plus size={16}/> Categoría</button><button className="primary-button" onClick={onNew}><Plus size={17}/> Nuevo producto</button></div> : null}/>
    {!canEdit && <div className="info-banner"><ShieldCheck size={17}/><span>Modo de consulta. Un administrador puede editar productos.</span></div>}
    <div className="panel product-panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, SKU o categoría…" aria-label="Buscar productos"/>{query ? <button type="button" className="clear-search" aria-label="Borrar búsqueda" onClick={() => setQuery('')}><X size={14}/></button> : <kbd>Ctrl K</kbd>}</div><div className="toolbar-right"><select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrar productos"><option value="all">Todos</option><option value="low">Stock bajo</option><option value="inactive">Inactivos</option></select><span className="result-count">{products.length} de {total} productos</span></div></div><div className="table-wrap"><table className="products-table"><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>SKU</th><th>PRECIO</th><th>STOCK</th><th>ESTADO</th><th/></tr></thead><tbody>{products.map((p: Product) => <tr key={p.id}><td><div className="product-cell"><span className="product-square"><Package size={17}/></span><span><b>{p.name}</b><small>{p.unit}</small></span></div></td><td>{p.categories?.name || 'Sin categoría'}</td><td><span className="mono muted">{p.sku}</span></td><td className="amount">{fmtMoney(p.sale_price)}</td><td><span className={`stock-chip ${p.is_active && p.stock_quantity <= p.minimum_stock ? 'low' : ''}`}>{p.stock_quantity} <small>{p.unit}</small></span></td><td><span className={`status ${p.is_active ? 'completed' : 'cancelled'}`}>{p.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="row-actions">{canEdit && <button className="quiet-button" onClick={() => onEdit(p)}>Editar</button>}{canStock && p.is_active && <button className="quiet-button" onClick={() => onStock(p)}>Stock</button>}{canEdit && (p.is_active ? <button className="quiet-button danger-text" onClick={() => onSetActive(p, false)}>Desactivar</button> : <button className="quiet-button" onClick={() => onSetActive(p, true)}>Reactivar</button>)}</td></tr>)}</tbody></table>{!products.length && <EmptyState text={filter === 'low' ? 'No hay productos con stock bajo.' : filter === 'inactive' ? 'No hay productos inactivos.' : 'No encontramos productos. Probá otra búsqueda o agregá el primero.'}/>}</div></div>
  </>
}
function Records({ title, eyebrow, icon, items, kind, canCreate, onCreate, onReceive, onCancel }: any) {
  const sale = kind === 'sale'
  const [query, setQuery] = useState('')
  const shown = items.filter((r: any) => sale
    ? matches(query, r.sale_number, r.customers?.full_name, saleStatusLabel(r))
    : matches(query, r.purchase_number, r.suppliers?.name, r.notes))
  return <><PageHeading eyebrow={eyebrow} title={title} description={sale ? 'Registrá ventas y consultá su historial.' : 'Creá órdenes y recibí mercadería contra el stock.'} action={canCreate ? <button className="primary-button" onClick={onCreate}><Plus size={17}/>{sale ? 'Nueva venta' : 'Nueva compra'}</button> : null}/><div className="panel record-panel"><div className="panel-heading"><div className="record-title-icon">{icon}<h2>{sale ? 'Ventas' : 'Órdenes de compra'}</h2></div><span className="result-count">{shown.length} de {items.length} registros</span></div>{items.length > 0 && <div className="list-toolbar"><SearchBox value={query} onChange={setQuery} placeholder={sale ? 'Buscar por número o cliente…' : 'Buscar por número o proveedor…'}/></div>}{shown.length ? <div className="table-wrap"><table><thead><tr><th>NÚMERO</th><th>{sale ? 'CLIENTE' : 'PROVEEDOR'}</th><th>FECHA</th><th>ESTADO</th><th className="align-right">{sale ? 'TOTAL' : 'SUBTOTAL'}</th><th>DETALLE</th>{!sale && <th/>}</tr></thead><tbody>{shown.map((r: any) => <tr key={r.id}><td><b className="mono">#{sale ? r.sale_number : r.purchase_number}</b></td><td>{sale ? r.customers?.full_name || 'Venta mostrador' : r.suppliers?.name || 'Proveedor sin asignar'}</td><td>{dateFmt.format(new Date(sale ? r.sold_at : r.ordered_at))}</td><td><span className={`status ${r.status === 'completed' || r.status === 'received' ? 'completed' : r.status}`}>{sale ? saleStatusLabel(r) : r.status === 'received' ? 'Recibida' : r.status === 'cancelled' ? 'Cancelada' : 'Borrador'}</span></td><td className="align-right amount">{fmtMoney(sale ? r.total : r.subtotal)}</td><td><details className="row-detail"><summary>Ver líneas</summary><div>{(sale ? r.items : r.purchase_order_items ?? []).map((line: any, index: number) => <p key={index}>{sale ? line.producto_nombre : line.product_name} · {line.cantidad ?? line.quantity} × {fmtMoney(sale ? line.precio_unitario : line.unit_cost)}</p>)}</div></details></td>{!sale && <td className="row-actions">{canCreate && r.status === 'draft' && <><button className="quiet-button" onClick={() => onReceive(r)}>Recibir</button><button className="quiet-button danger-text" onClick={() => onCancel(r)}>Cancelar</button></>}</td>}</tr>)}</tbody></table></div> : <EmptyState text={items.length ? 'Ningún registro coincide con la búsqueda.' : sale ? 'Aún no hay ventas registradas.' : 'Aún no hay órdenes de compra.'} />}</div></>
}
function Customers({ customers, canEdit, isAdmin, onNew, onEdit, onArchive }: any) {
  const [query, setQuery] = useState('')
  const shown = customers.filter((c: any) => matches(query, c.full_name, c.company, c.phone, c.email))
  return <><PageHeading eyebrow="RELACIONES" title="Clientes" description="Administrá el directorio y los datos de contacto." action={canEdit ? <button className="primary-button" onClick={onNew}><Plus size={17}/> Nuevo cliente</button> : null}/><div className="panel record-panel"><div className="panel-heading"><div className="record-title-icon"><Users size={19}/><h2>Directorio</h2></div><span className="result-count">{shown.length} de {customers.length} clientes</span></div>{customers.length > 0 && <div className="list-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar por nombre, empresa, teléfono o correo…"/></div>}{shown.length ? <div className="table-wrap"><table><thead><tr><th>NOMBRE</th><th>EMPRESA</th><th>TELÉFONO</th><th>CORREO</th><th>DESCUENTO</th><th/></tr></thead><tbody>{shown.map((c: any) => <tr key={c.id}><td><div className="customer-cell"><span>{c.full_name[0]?.toUpperCase()}</span><b>{c.full_name}</b></div></td><td>{c.company || '—'}</td><td>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</td><td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td><td>{c.discount > 0 ? <span className="status completed">{c.discount} %</span> : '—'}</td><td className="row-actions">{canEdit && <button className="quiet-button" onClick={() => onEdit(c)}>Editar</button>}{isAdmin && <button className="quiet-button danger-text" onClick={() => onArchive(c)}>Archivar</button>}</td></tr>)}</tbody></table></div> : <EmptyState text={customers.length ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'} />}</div></> }
function Employees({ employees, currentUserId, currentProfileId, onNew, onUpdate, onDelete }: any) {
  return <><PageHeading eyebrow="EQUIPO" title="Empleados" description="Creá cuentas, asigná permisos o eliminá usuarios, incluidos otros administradores." action={<button className="primary-button" onClick={onNew}><Plus size={17}/> Agregar empleado</button>}/><div className="panel record-panel"><div className="panel-heading"><div className="record-title-icon"><Users size={19}/><h2>Usuarios y permisos</h2></div><span className="result-count">{employees.length} perfiles</span></div>{employees.length ? <div className="table-wrap"><table><thead><tr><th>PERSONA</th><th>ROL</th><th>MOVIMIENTOS</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{employees.map((e: Employee) => { const isMe = e.auth_user_id === currentUserId || e.id === currentProfileId; return <tr key={e.id}><td><div className="customer-cell"><span>{(e.nombre?.[0] || e.email?.[0] || 'E').toUpperCase()}</span><div><b>{e.nombre} {e.apellido}</b><small>{e.email}{e.telefono ? ` · ${e.telefono}` : ''}</small></div></div></td><td><select className="employee-select" value={e.rol} disabled={isMe} onChange={ev => onUpdate(e, { rol: ev.target.value })}><option value="empleado">Empleado</option><option value="admin">Administrador</option></select></td><td><input type="checkbox" aria-label="Puede registrar movimientos" checked={e.rol === 'admin' || e.puede_movimientos} disabled={e.rol === 'admin'} onChange={ev => onUpdate(e, { puede_movimientos: ev.target.checked })}/></td><td><span className={`status ${e.activo ? 'completed' : 'cancelled'}`}>{e.activo ? 'Activo' : 'Suspendido'}</span></td><td className="row-actions"><button className={`quiet-button ${e.activo ? 'danger-text' : ''}`} disabled={isMe} onClick={() => onUpdate(e, { activo: !e.activo })}>{e.activo ? 'Suspender' : 'Reactivar'}</button><button className="quiet-button danger-text" disabled={isMe} onClick={() => onDelete(e)}><Trash2 size={13}/> Borrar</button></td></tr>})}</tbody></table></div> : <EmptyState text="No hay perfiles de empleados para mostrar." />}</div><div className="info-banner"><ShieldCheck size={17}/><span>Podés borrar otros administradores. La cuenta con la que estás conectado no se puede borrar y siempre debe quedar al menos un administrador activo.</span></div></>
}
function Suppliers({ suppliers, onNew, onEdit, onToggle }: any) {
  return <><PageHeading eyebrow="ABASTECIMIENTO" title="Proveedores" description="Administrá contactos y proveedores de mercadería." action={<button className="primary-button" onClick={onNew}><Plus size={17}/> Nuevo proveedor</button>}/><div className="panel record-panel"><div className="panel-heading"><div className="record-title-icon"><Truck size={19}/><h2>Directorio</h2></div><span className="result-count">{suppliers.length} proveedores</span></div>{suppliers.length ? <div className="table-wrap"><table><thead><tr><th>PROVEEDOR</th><th>CONTACTO</th><th>TELÉFONO</th><th>CORREO</th><th>ESTADO</th><th/></tr></thead><tbody>{suppliers.map((s: Supplier) => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.contact_name || '—'}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td><td><span className={`status ${s.is_active ? 'completed' : 'cancelled'}`}>{s.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="row-actions"><button className="quiet-button" onClick={() => onEdit(s)}>Editar</button><button className="quiet-button" onClick={() => onToggle(s)}>{s.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div> : <EmptyState text="Agregá proveedores para asociarlos a las órdenes de compra." />}</div></>
}
function ModalLayout({ title, eyebrow, children, onClose, onSubmit, submitLabel = 'Guardar', busy = false }: any) {
  // Guards every form against double submits (duplicate customers, purchases, etc.).
  const [submitting, setSubmitting] = useState(false)
  useEscape(onClose)
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    if (submitting || busy) { e.preventDefault(); return }
    setSubmitting(true)
    try { await onSubmit(e) } finally { setSubmitting(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><form className="product-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></div>{children}<div className="modal-actions"><button className="outline-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy || submitting}>{submitting && !busy ? 'Guardando…' : submitLabel}<ArrowUpRight size={16}/></button></div></form></div>
}
function EmployeeModal({ onClose, onSave }: any) {
  return <ModalLayout title="Agregar empleado" eyebrow="EQUIPO" onClose={onClose} onSubmit={onSave} submitLabel="Crear cuenta"><p className="form-help">Se crea la cuenta de acceso al programa. Compartí la contraseña temporal con el empleado para que ingrese.</p><div className="form-grid"><label>Nombre<input name="nombre" required autoFocus/></label><label>Apellido<input name="apellido"/></label><label className="span-two">Correo electrónico<input name="email" type="email" required autoComplete="off"/></label><label className="span-two">Contraseña temporal<input name="password" type="password" minLength={10} required autoComplete="new-password"/><small>Mínimo 10 caracteres. El administrador puede cambiar permisos luego.</small></label></div></ModalLayout>
}
function CustomerModal({ item, onClose, onSave }: any) {
  return <ModalLayout title={item ? 'Editar cliente' : 'Nuevo cliente'} eyebrow="CLIENTES" onClose={onClose} onSubmit={onSave}><div className="form-grid"><label>Nombre<input name="nombre" defaultValue={item?.nombre} required/></label><label>Apellido<input name="apellido" defaultValue={item?.apellido}/></label><label>Empresa<input name="empresa" defaultValue={item?.empresa}/></label><label>Teléfono<input name="telefono" defaultValue={item?.telefono}/></label><label className="span-two">Correo<input name="email" type="email" defaultValue={item?.email}/></label><label className="span-two">Dirección<input name="direccion" defaultValue={item?.direccion}/></label><label className="span-two">Descuento fijo (%)<input name="descuento_porcentaje" type="number" min="0" max="100" step="0.01" defaultValue={item?.discount ?? 0}/><small>Se aplica automáticamente cuando elegís a este cliente en la caja. Dejalo en 0 si no tiene descuento.</small></label><label className="span-two">Notas<textarea name="observaciones" defaultValue={item?.observaciones} rows={2}/></label></div></ModalLayout>
}
function SupplierModal({ item, onClose, onSave }: any) {
  return <ModalLayout title={item ? 'Editar proveedor' : 'Nuevo proveedor'} eyebrow="PROVEEDORES" onClose={onClose} onSubmit={onSave}><div className="form-grid"><label className="span-two">Nombre<input name="name" defaultValue={item?.name} required/></label><label>Contacto<input name="contact_name" defaultValue={item?.contact_name}/></label><label>Teléfono<input name="phone" defaultValue={item?.phone}/></label><label className="span-two">Correo<input name="email" type="email" defaultValue={item?.email}/></label><label className="span-two">Dirección<input name="address" defaultValue={item?.address}/></label><label className="span-two">Notas<textarea name="notes" defaultValue={item?.notes} rows={2}/></label></div></ModalLayout>
}
function PurchaseModal({ products, suppliers, onClose, onSave }: any) {
  const [items, setItems] = useState<any[]>([]); const [productId, setProductId] = useState(''); const [quantity, setQuantity] = useState('1'); const [cost, setCost] = useState('0'); const [busy, setBusy] = useState(false); const [lineError, setLineError] = useState('')
  const selectProduct = (id: string) => { setProductId(id); const p = products.find((x: Product) => x.id === id); if (p) setCost(String(p.cost_price || 0)) }
  const addItem = () => {
    const p = products.find((x: Product) => x.id === productId); const q = Number(quantity), c = Number(cost)
    if (!p) { setLineError('Elegí un producto.'); return }
    if (!Number.isInteger(q) || q < 1) { setLineError('La cantidad debe ser un número entero mayor a cero.'); return }
    if (!Number.isFinite(c) || c < 0) { setLineError('El costo no puede ser negativo.'); return }
    setLineError(''); setItems((old: any[]) => [...old, { key: crypto.randomUUID(), product_id: Number(p.id), quantity: q, unit_cost: c, name: p.name }]); setProductId(''); setQuantity('1'); setCost('0')
  }
  const removeItem = (key: string) => setItems((old: any[]) => old.filter((x: any) => x.key !== key))
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!items.length) { setLineError('Agregá al menos un producto.'); return }
    setBusy(true); const f = new FormData(e.currentTarget)
    try { await onSave({ supplierId: Number(f.get('supplier_id')) || null, notes: String(f.get('notes') || ''), items: items.map(({ product_id, quantity, unit_cost }) => ({ product_id, quantity, unit_cost })) }) } finally { setBusy(false) }
  }
  return <ModalLayout title="Nueva compra" eyebrow="ABASTECIMIENTO" onClose={onClose} onSubmit={submit} busy={busy} submitLabel={busy ? 'Guardando…' : 'Crear borrador'}><div className="form-grid"><label className="span-two">Proveedor<select name="supplier_id"><option value="">Sin asignar</option>{suppliers.map((s: Supplier) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="span-two">Producto<select value={productId} onChange={e => selectProduct(e.target.value)}><option value="">Elegí producto</option>{products.map((p: Product) => <option key={p.id} value={p.id}>{p.name} · stock {p.stock_quantity}</option>)}</select></label><label>Cantidad<input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}/></label><label>Costo unitario<input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}/></label><div className="span-two"><button type="button" className="secondary-button" onClick={addItem}>Agregar línea</button></div><label className="span-two">Notas<textarea name="notes" rows={2}/></label></div>{lineError && <p className="form-error" role="alert">{lineError}</p>}<div className="cart-lines">{items.length ? items.map((i: any) => <div key={i.key}><span>{i.name} × {i.quantity} · {fmtMoney(i.unit_cost)} c/u</span><span className="cart-line-end"><b>{fmtMoney(i.unit_cost * i.quantity)}</b><button type="button" className="quiet-button danger-text" onClick={() => removeItem(i.key)}>Quitar</button></span></div>) : <div><span className="muted">Todavía no agregaste productos.</span></div>}<strong>Subtotal: {fmtMoney(items.reduce((sum: number, i: any) => sum + i.unit_cost * i.quantity, 0))}</strong></div></ModalLayout>
}
function StockModal({ product, isAdmin, onClose, onSave }: any) {
  return <ModalLayout title={`Stock · ${product.name}`} eyebrow="INVENTARIO" onClose={onClose} onSubmit={onSave} submitLabel="Registrar movimiento"><div className="form-grid"><label>Movimiento<select name="movement_type"><option value="entrada">Entrada</option><option value="salida">Salida</option>{isAdmin && <option value="ajuste">Ajustar a cantidad</option>}</select></label><label>Cantidad<input name="quantity" type="number" min="0" step="1" defaultValue="1" required/><small>Stock actual: {product.stock_quantity}</small></label><label className="span-two">Motivo<input name="reason" placeholder="Compra, devolución, conteo…"/></label></div></ModalLayout>
}
function CategoryModal({ onClose, onSave }: any) {
  return <ModalLayout title="Nueva categoría" eyebrow="CATÁLOGO" onClose={onClose} onSubmit={onSave}><div className="form-grid"><label className="span-two">Nombre<input name="name" required autoFocus/></label><label className="span-two">Descripción<textarea name="description" rows={2}/></label></div></ModalLayout>
}
function ProfileView({ profile, onSave, onPasswordChange }: any) { return <><PageHeading eyebrow="CUENTA" title="Mi perfil" description="Actualizá tus datos de contacto y la contraseña."/><div className="profile-grid"><section className="integration-card"><h2>Datos básicos</h2><form className="profile-form" onSubmit={onSave}><label>Nombre<input name="nombre" defaultValue={profile.nombre} required/></label><label>Apellido<input name="apellido" defaultValue={profile.apellido}/></label><label>Correo electrónico<input value={profile.email} disabled readOnly/></label><label>Celular<input name="telefono" type="tel" defaultValue={profile.telefono || ''} placeholder="+598 99 123 456"/></label><button className="primary-button" type="submit">Guardar perfil<ArrowUpRight size={16}/></button></form></section><section className="integration-card"><h2>Cambiar contraseña</h2><p>Elegí una contraseña única de al menos 10 caracteres.</p><form className="profile-form" onSubmit={onPasswordChange}><label>Nueva contraseña<input name="password" type="password" minLength={10} autoComplete="new-password" required/></label><button className="primary-button" type="submit">Actualizar contraseña<ShieldCheck size={16}/></button></form></section></div></> }
function Integrations({ theme, onToggleTheme, isAdmin, helpConfig, onSaveHelp, onSaveBusiness }: any) { return <><PageHeading eyebrow="CONFIGURACIÓN" title="Preferencias y ayuda" description="Personalizá la interfaz, los datos del ticket y el contacto de soporte."/><div className="integration-grid"><div className="integration-card"><div className="integration-top"><div className="integration-logo supa">{theme === 'dark' ? <Moon size={18}/> : <Sun size={18}/>}</div><span className="connection-status"><i/>{theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}</span></div><h2>Apariencia</h2><p>El tema se guarda en este dispositivo y se mantiene al volver al programa.</p><button className="outline-button theme-toggle" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>} {theme === 'dark' ? 'Usar tema claro' : 'Activar tema oscuro'}</button></div>{isAdmin && <div className="integration-card"><div className="integration-top"><div className="integration-logo supa"><Receipt size={18}/></div><span className={`connection-status ${helpConfig.business_rut ? '' : 'pending'}`}><i/>{helpConfig.business_rut ? 'Completo' : 'Falta el RUT'}</span></div><h2>Datos del ticket</h2><p>Se imprimen en el encabezado y el pie de cada ticket de venta.</p><form className="profile-form" onSubmit={onSaveBusiness}><label>Nombre del comercio<input name="business_name" defaultValue={helpConfig.business_name} required/></label><label>RUT<input name="business_rut" defaultValue={helpConfig.business_rut} placeholder="21 234567 0012"/></label><label>Dirección<input name="business_address" defaultValue={helpConfig.business_address} placeholder="Av. Siempre Viva 123, Montevideo"/></label><label>Teléfono<input name="business_phone" type="tel" defaultValue={helpConfig.business_phone}/></label><label>Mensaje al pie<input name="ticket_footer" defaultValue={helpConfig.ticket_footer}/></label><button className="primary-button" type="submit">Guardar datos del ticket<ArrowUpRight size={16}/></button></form></div>}<div className="integration-card"><div className="integration-top"><div className="integration-logo supa"><CircleHelp size={18}/></div><span className={`connection-status ${helpConfig.help_email || helpConfig.help_phone ? '' : 'pending'}`}><i/>{helpConfig.help_email || helpConfig.help_phone ? 'Configurado' : 'Sin configurar'}</span></div><h2>Contacto de ayuda</h2>{isAdmin ? <form className="profile-form" onSubmit={onSaveHelp}><label>Correo de soporte<input name="help_email" type="email" defaultValue={helpConfig.help_email}/></label><label>Celular / WhatsApp<input name="help_phone" type="tel" defaultValue={helpConfig.help_phone} placeholder="+598 99 123 456"/></label><label>Mensaje para el equipo<textarea name="help_message" rows={3} defaultValue={helpConfig.help_message}/></label><button className="primary-button" type="submit">Guardar contacto<ArrowUpRight size={16}/></button></form> : <><p>{helpConfig.help_message}</p><div className="integration-meta"><span>{helpConfig.help_email || helpConfig.help_phone || 'Contactá al administrador'}</span><CircleHelp size={16}/></div></>}</div><div className="integration-card dgi-card"><div className="integration-top"><div className="integration-logo dgi">DGI</div><span className="connection-status pending"><i/>Pendiente</span></div><h2>Dirección General Impositiva</h2><p>La emisión fiscal requiere una API y credenciales de un proveedor configurado. Por ahora las ventas no generan comprobantes fiscales.</p><div className="integration-meta"><span>No conectada</span><ArrowDownRight size={16}/></div></div></div></> }
function HelpModal({ config, onClose }: any) { useEscape(onClose); const digits=String(config.help_phone || '').replace(/\D/g,''); const phoneHref=digits ? `https://wa.me/${digits}` : ''; return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="product-modal help-modal" role="dialog" aria-modal="true" aria-label="Ayuda"><div className="modal-heading"><div><span className="eyebrow">SOPORTE</span><h2>¿Necesitás ayuda?</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></div><p>{config.help_message || 'Contactá al administrador de la ferretería para recibir ayuda.'}</p><div className="help-links">{config.help_email && <a className="outline-button" href={`mailto:${config.help_email}`}><Mail size={16}/> {config.help_email}</a>}{config.help_phone && <a className="outline-button" href={phoneHref || `tel:${config.help_phone}`} target={phoneHref ? '_blank' : undefined} rel="noreferrer"><Phone size={16}/> {config.help_phone}</a>}{!config.help_email && !config.help_phone && <span>El administrador todavía no configuró los datos de contacto.</span>}</div></div></div> }
function ProductModal({ item, categories, onClose, onSave }: any) {
  // Keep the product's current category selectable even if that category was deactivated.
  const options = item?.category_id && !categories.some((c: any) => c.id === item.category_id) ? [...categories, { id: item.category_id, name: item.categories?.name || 'Categoría inactiva' }] : categories
  return <ModalLayout title={item ? 'Editar producto' : 'Nuevo producto'} eyebrow="CATÁLOGO" onClose={onClose} onSubmit={onSave} submitLabel={item ? 'Guardar cambios' : 'Crear producto'}><div className="form-grid"><label className="span-two">Nombre del producto<input name="name" defaultValue={item?.name} placeholder="Ej. Taladro percutor 650W" required autoFocus/></label><label>SKU / Código<input name="sku" defaultValue={item?.sku} placeholder="FER-001" required/></label><label>Categoría<select name="category_id" defaultValue={item?.category_id ?? ''}><option value="">Sin categoría</option>{options.map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Unidad<select name="unit" defaultValue={item?.unit ?? 'unidad'}><option>unidad</option><option>caja</option><option>metro</option><option>kg</option><option>litro</option><option>par</option><option>rollo</option></select></label><label>Precio de costo<input type="number" name="cost_price" step="0.01" min="0" defaultValue={item?.cost_price ?? 0}/></label><label>Precio de venta<input type="number" name="sale_price" step="0.01" min="0" defaultValue={item?.sale_price ?? 0} required/></label><label>Stock actual<input type="number" name="stock_quantity" min="0" step="1" defaultValue={item?.stock_quantity ?? 0}/><small>Si lo cambiás, se registra un ajuste de stock.</small></label><label>Stock mínimo<input type="number" name="minimum_stock" min="0" step="1" defaultValue={item?.minimum_stock ?? 0}/></label><label className="span-two">Descripción<textarea name="description" defaultValue={item?.description ?? ''} rows={2} placeholder="Detalles opcionales"/></label></div></ModalLayout>
}
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><span><ArrowDownLeft size={17}/></span><p>{text}</p></div> }
