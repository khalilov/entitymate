import { collection, entity, type EntityBehavior } from '../src'

const behavior = () =>
  entity({
    get label() {
      return 'Tools'
    },
    setLabel(label: string) {
      return label.length
    },
  })
const readLabel = ({ label, setLabel }: EntityBehavior<ReturnType<typeof behavior>>) => setLabel(label)

readLabel(collection([{ id: 'tools' }], behavior).require('tools')).toFixed()

const categories = collection([{ id: 'tools', name: 'Tools' }])
const rows = [{ sku: 'drill', details: { category: { id: 'tools' }, brand: 'Makita' } }]
const products = collection(
  rows,
  (context) =>
    entity({
      get caption() {
        return context.meta.label.toUpperCase()
      },
      get category() {
        return context.relations.categories.get(context._current.details.category.id)
      },
    }),
  {
    cacheBy: {
      sku: { unique: true },
      'details.category.id': {},
      brand: (row) => row.details.brand,
    },
    relations: { categories },
    config: { limit: 10 },
    meta: { label: 'Products' },
    methods: {
      limit() {
        return this.config.limit
      },
    },
  }
)

products.limit().toFixed()
products.meta.label.toUpperCase()
products.require('drill').caption.toUpperCase()
products.getBy('sku', 'drill')?.category?.name.toUpperCase()
products.getBy('details.category.id', 'tools').findBy('details.brand', 'Makita')
products.getBy('brand', 'Makita')
products.update('drill', 'details.category.id', 'tools')
// @ts-expect-error Category ID is a string.
products.update('drill', 'details.category.id', 1)
// @ts-expect-error Unknown property path.
products.update('drill', 'details.missing', 'tools')
products.require('drill').belongsTo({ _id: 'drill', 'details.category.id': 'tools' })
// @ts-expect-error Unknown property path.
products.require('drill').belongsTo({ 'details.missing': 'tools' })
// @ts-expect-error Category ID is a string.
products.require('drill').belongsTo({ 'details.category.id': 1 })
// @ts-expect-error Index must be declared.
products.getBy('missing', 'value')
// @ts-expect-error SKU is a string.
products.getBy('sku', 1)

// @ts-expect-error Field indexes are addressed by the declared path.
products.getBy('categoryId', 'tools')
