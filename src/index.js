import { addFilter } from '@wordpress/hooks';
import { __ } from '@wordpress/i18n';
import { AdvancedReport } from './components/AdvancedReport';

addFilter( 'woocommerce_admin_reports_list', 'be1-reports4wc', ( reports ) => {
	return [
		...reports,
		{
			report: 'be1-reports',
			title: __( 'Be1 Reports', 'be1-reports4wc' ),
			component: AdvancedReport,
		},
	];
} );
