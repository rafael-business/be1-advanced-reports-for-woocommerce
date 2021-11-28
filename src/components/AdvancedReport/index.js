import { Button } from '@wordpress/components';
import { Component as ReactComponent, Fragment, useRef } from "@wordpress/element";
import { appendTimestamp, getCurrentDates, getDateParamsFromQuery } from "@woocommerce/date";
import apiFetch from "@wordpress/api-fetch";
import { Date, Link, ReportFilters, SummaryList, SummaryNumber, TableCard, OrderStatus } from "@woocommerce/components";
import {
    getIdsFromQuery,
    getSearchWords,
    onQueryChange,
    updateQueryString,
} from '@woocommerce/navigation';
import DownloadIcon from './download-icon';
import {default as Currency} from "@woocommerce/currency";
import {CURRENCY as storeCurrencySetting, getSetting} from "@woocommerce/settings";
import { recordEvent } from '@woocommerce/tracks';
import * as FileSaver from "file-saver";
import * as XLSX from "xlsx";

export class AdvancedReport extends ReactComponent {

    constructor(props) {

        super(props);

        const {path, query, endpoint} = this.props;
        const dateQuery = this.createDateQuery(query);
        const storeCurrency = new Currency(storeCurrencySetting);
        const loading = true;

        this.state = {
            dateQuery: dateQuery,
            path: path,
            currency: storeCurrency,
            data: [],
            data_xlsx: []
        };

        this.handleDateChange = this.handleDateChange.bind(this);
        this.fetchData(this.state.dateQuery, 100);
    }

    createDateQuery(query) {

        const {period, compare, before, after} = getDateParamsFromQuery(query);
        const {primary: primaryDate, secondary: secondaryDate} = getCurrentDates(query);

        return {period, compare, before, after, primaryDate, secondaryDate};
    }

    getQueryParameters(dateQuery) {

        const afterDate = encodeURIComponent(appendTimestamp(dateQuery.primaryDate.after, "start"));
        const beforeDate = encodeURIComponent(appendTimestamp(dateQuery.primaryDate.before, "end"));

        return `&after=${afterDate}&before=${beforeDate}&interval=day&order=asc&per_page=100&_locale=user`;
    }

    handleDateChange(newQuery) {

        const newDateQuery = this.createDateQuery(newQuery);

        this.setState({dateQuery: newDateQuery});
        this.fetchData(newDateQuery);
    }

    fetchData(dateQuery) {

        const fields = [
            'id',
            'line_items',
            'status',
            'shipping',
            'billing',
            'meta_data',
            'date_created',
            'date_created_gmt',
            'currency',
            'shipping_lines'
        ];
        
        const endPoint = '/wc/v3/orders?_fields=' + fields.join(',');
        const queryParameters = this.getQueryParameters(dateQuery);
        const ordersPath = endPoint + queryParameters;

        apiFetch({path: ordersPath, parse: false})
        .then(response => {

            const totalPages = response.headers && response.headers.get( 'X-WP-TotalPages' );
            const calls = this.getCalls(totalPages, ordersPath);

            Promise.all(calls.map(call => apiFetch({path: call, parse: true})))
                .then(allOrders => this.prepareData(allOrders.flat()))
                .catch(err => console.log(err));
        })
        .catch(err => console.log(err));
    }

    prepareData(orders) {

        let data = [], data_xlsx = [], product_ids = [];
        let statuses = getSetting( 'orderStatuses', {} );

        orders.map(order => {

            let order_formatted = {}, order_xlsx = {};

            const deliveryPlace = this.deliveryPlace(order.shipping, order.billing, order.shipping_lines);
            const nAssociado = this.nAssociado(order.meta_data);
            const nomeAssociado = this.nomeAssociado(order.shipping, order.billing);
            const shTotal = this.shTotal(order.shipping_lines);

            order.line_items.map(item => {

                order_formatted = {
                    id: order.id,
                    status: order.status,
                    delivery_place: deliveryPlace,
                    item_id: item.product_id,
                    item_name: item.name,
                    item_price: item.price,
                    sh_total: shTotal,
                    item_quantity: item.quantity,
                    n_associado: nAssociado,
                    nome_associado: nomeAssociado,
                    categories: '',
                    aasp_product_id: ''
                };

                order_xlsx = {
                    'Pedido #': order.id,
                    'Item #': item.product_id,
                    'RM #': '',
                    'Nome': item.name,
                    'Valor': item.price,
                    'Postagem': shTotal,
                    'Qtd.': item.quantity,
                    'Nº Assoc.': nAssociado,
                    'Nome Assoc.': nomeAssociado,
                    'Entrega': deliveryPlace,
                    'Categoria': '',
                    'Status': statuses[order.status]
                };

                product_ids.push(item.product_id);
                data.push(order_formatted);
                data_xlsx.push(order_xlsx);
            });
        });

        this.pushDataPos(product_ids.join(','), data, data_xlsx);
    }

    deliveryPlace(shipping, billing, shipping_lines) {

        let shipping_methods = [];
        let address = shipping ? shipping : billing;
        shipping_lines.map(line => {

            let deliveryPlace = line.method_title.replace('&nbsp;&nbsp;', '-');
            if ( 'aaspwc_aasp_shipping' === line.method_id ) {

                deliveryPlace += ' - ' + address.city + ', ';
                deliveryPlace += address.state;
            }
            shipping_methods.push(deliveryPlace);
        });

        return shipping_methods.join(',');
    }

    nAssociado(meta_data) {

        let n_associado = meta_data.find(data => data.key === '_billing_aasp_code');
        return n_associado ? n_associado.value : '';
    }

    nomeAssociado(shipping, billing) {

        let address = shipping ? shipping : billing;
        let nomeAssociado = address.first_name + ' ';
            nomeAssociado += address.last_name;

        return nomeAssociado;
    }

    shTotal(shipping_lines) {

        console.log(shipping_lines);
        if ( !shipping_lines || 0 === shipping_lines.length ) return 0;
        return shipping_lines[0].total;
    }

    pushDataPos(product_ids, data, data_xlsx) {

        apiFetch({path: "/wc/v3/products/?include="+product_ids+"&_fields=id,categories,meta_data&per_page=100"})
        .then(products => {
            
            products.map(product => {

                let cats = product.categories.map(category => category.name);
                let aaspwc_product_id = this.aaspProductId(product.meta_data);

                let orders = data.filter(dt => product.id === dt.item_id);
                orders.map(order => {
                    order.categories = cats.join(', ');
                    order.aaspwc_product_id = aaspwc_product_id;

                    let i = data.findIndex(row => order === row);
                    let order_xlsx = data_xlsx[i];
                    order_xlsx = Object.assign(order_xlsx, {'Categoria': cats.join(', ')});
                    order_xlsx = Object.assign(order_xlsx, {'RM #': aaspwc_product_id});
                });
            });
        })
        .catch(err => console.log(err))
        .finally(() => this.setState({data: data, data_xlsx: data_xlsx, loading: false}));
    }

    aaspProductId(meta_data) {

        let aaspwc_product_id = meta_data.find(data => data.key === 'aaspwc_product_id');
        return aaspwc_product_id ? aaspwc_product_id.value : '';
    }

    getCalls(totalPages, ordersPath){

        var calls = [];
        for (var i = 1; i <= parseInt(totalPages); i++) {

            calls.push(ordersPath + '&page=' + i);
        }
        return calls;
    }

    componentDidUpdate(prevProps) {

        this.loading = this.loading ? false : true;
    }

    render() {
        if (this.loading) {
            return 'Esperando por dados...';
        } else {

            const {data, data_xlsx, currency, dateQuery} = this.state;

            const tableData = {
                headers: [],
                rows: []
            };

            tableData.headers = [
                {
                    key: 'order_id', 
                    label: 'Pedido #', 
                    screenReaderLabel: 'Pedido #', 
                    isLeftAligned: true, 
                    required: true
                },
                {
                    key: 'item_id', 
                    label: 'Item #', 
                    screenReaderLabel: 'Item #', 
                    isLeftAligned: true, 
                    required: true 
                },
                {
                    key: 'aaspwc_product_id', 
                    label: 'RM #', 
                    screenReaderLabel: 'RM #', 
                    isLeftAligned: true 
                },
                {
                    key: 'item_name', 
                    label: 'Nome', 
                    screenReaderLabel: 'Nome', 
                    isLeftAligned: true
                },
                {
                    key: 'item_price', 
                    label: 'Valor', 
                    screenReaderLabel: 'Valor', 
                    isLeftAligned: true
                },
                {
                    key: 'sh_total', 
                    label: 'Postagem', 
                    screenReaderLabel: 'Postagem', 
                    isLeftAligned: true
                },
                {
                    key: 'item_quantity', 
                    label: 'Qtd.', 
                    screenReaderLabel: 'Qtd.'
                },
                {
                    key: 'n_associado', 
                    label: 'Nº Assoc.', 
                    screenReaderLabel: 'Nº Assoc.',
                    isLeftAligned: true
                },
                {
                    key: 'nome_associado', 
                    label: 'Nome Assoc.', 
                    screenReaderLabel: 'Nome Assoc.',
                    isLeftAligned: true
                },
                {
                    key: 'delivery_place', 
                    label: 'Local de Entrega', 
                    screenReaderLabel: 'Local de Entrega', 
                    isLeftAligned: true 
                },
                {
                    key: 'categories', 
                    label: 'Categorias', 
                    screenReaderLabel: 'Categorias', 
                    isLeftAligned: true 
                },
                {
                    key: 'status', 
                    label: 'Status', 
                    screenReaderLabel: 'Status', 
                    isLeftAligned: false 
                }
            ];

            data.map(item => {
                const status = item.status;
                const row = [
                    {
                        display: (
                            <Link
                                href={
                                    'post.php?post=' +
                                    item.id +
                                    '&action=edit'
                                }
                                type="wp-admin"
                            >
                                { item.id }
                            </Link>
                        ),
                        value: item.id
                    },
                    {
                        display: (
                            <Link
                                href={
                                    'post.php?post=' +
                                    item.item_id +
                                    '&action=edit'
                                }
                                type="wp-admin"
                            >
                                { item.item_id }
                            </Link>
                        ),
                        value: item.item_id
                    },
                    {
                        display: item.aaspwc_product_id,
                        value: item.aaspwc_product_id
                    },
                    {
                        display: item.item_name,
                        value: item.item_name
                    },
                    {
                        display: currency.render(item.item_price),
                        value: item.item_price
                    },
                    {
                        display: currency.render(item.sh_total),
                        value: item.sh_total
                    },
                    {
                        display: item.item_quantity,
                        value: item.item_quantity
                    },
                    {
                        display: item.n_associado,
                        value: item.n_associado
                    },
                    {
                        display: item.nome_associado,
                        value: item.nome_associado
                    },
                    {
                        display: item.delivery_place,
                        value: item.delivery_place
                    },
                    {
                        display: item.categories,
                        value: item.categories
                    },
                    {
                        display: (
                            <OrderStatus
                                className="woocommerce-orders-table__status"
                                order={ { status } }
                                orderStatusMap={ getSetting( 'orderStatuses', {} ) }
                            />
                        ),
                        value: status,
                    }
                ];
                tableData.rows.push(row);
            });

            const totalResults = tableData.rows.length;

            const fileType =
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8";
            const fileExtension = ".xlsx";

            const exportToXLSX = (dataXLSX, fileName) => {

                const ws = XLSX.utils.json_to_sheet(dataXLSX);
                const wb = { Sheets: { data: ws }, SheetNames: ["data"] };
                const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                const data = new Blob([excelBuffer], { type: fileType });

                FileSaver.saveAs(data, fileName + fileExtension);
            };

            const onPageChange = ( newPage, source ) => {

                if ( source ) {
                    if ( source === 'goto' ) {
                        recordEvent( 'analytics_table_go_to_page', {
                            report: this.endpoint,
                            page: newPage,
                        } );
                    } else {
                        recordEvent( 'analytics_table_page_click', {
                            report: this.endpoint,
                            direction: source,
                        } );
                    }
                }
            };

            return <Fragment>
                <ReportFilters
                    dateQuery={dateQuery}
                    query={this.props.query}
                    path={this.props.path}
                    onDateSelect={this.handleDateChange}
                    //ref={ scrollPointRef }
                />
                <TableCard
                    className={ 'woocommerce-report-table' }
                    title="Pedidos"
                    actions={ [
                        (
                            <Button
                                key="download"
                                className="woocommerce-table__download-button"
                                onClick={(e) => exportToXLSX(data_xlsx, 'Planilha - ' + dateQuery.primaryDate.label)}
                            >
                                <DownloadIcon />
                                <span className="woocommerce-table__download-button__label">
                                    Planilha
                                </span>
                            </Button>
                        )
                    ] }
                    headers={tableData.headers}
                    rows={tableData.rows}
                    onQueryChange={ onQueryChange }
                    onPageChange={ onPageChange }
                    rowsPerPage={100000}
                    totalRows={totalResults}
                />
            </Fragment>
        }
    }
}