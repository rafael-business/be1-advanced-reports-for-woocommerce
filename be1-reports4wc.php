<?php
/**
 * Plugin Name: 	  Be1 Reports for WooCommerce
 * Plugin URI:        https://be1.sh/plugins/be1-reports4wc
 * Description:       Relatórios avançados para WooCommerce.
 * Version:           1.0.9
 * Author:            Be1
 * Author URI:        https://be1.sh
 * License:           GPL-3.0+
 * License URI:       http://www.gnu.org/licenses/gpl-3.0.txt
 * Text Domain:       be1-reports4wc
 * Domain Path:       /languages
 * 
 * @package WooCommerce\Admin
 */

/**
 * Register the JS.
 */
function add_extension_register_script() {
	if ( ! class_exists( 'Automattic\WooCommerce\Admin\Loader' ) || ! \Automattic\WooCommerce\Admin\Loader::is_admin_or_embed_page() ) {
		return;
	}
	
	$script_path       = '/build/index.js';
	$script_asset_path = dirname( __FILE__ ) . '/build/index.asset.php';
	$script_asset      = file_exists( $script_asset_path )
		? require( $script_asset_path )
		: array( 'dependencies' => array(), 'version' => filemtime( $script_path ) );
	$script_url = plugins_url( $script_path, __FILE__ );

	wp_register_script(
		'be1-reports4wc',
		$script_url,
		$script_asset['dependencies'],
		$script_asset['version'],
		true
	);

	/*
	wp_register_style(
		'be1-reports4wc',
		plugins_url( '/build/index.css', __FILE__ ),
		// Add any dependencies styles may have, such as wp-components.
		array(),
		filemtime( dirname( __FILE__ ) . '/build/index.css' )
	);
	*/

	wp_enqueue_script( 'be1-reports4wc' );
	//wp_enqueue_style( 'be1-reports4wc' );
}

add_action( 'admin_enqueue_scripts', 'add_extension_register_script' );

/**
 * Add "Example" as a Analytics submenu item.
 *
 * @param array $report_pages Report page menu items.
 * @return array Updated report page menu items.
 */
function add_report_add_report_menu_item( $report_pages ) {
	$report_pages[] = array(
		'id'     => 'be1-reports',
		'title'  => __( 'Be1 Reports', 'be1-reports4wc' ),
		'parent' => 'woocommerce-analytics',
		'path'   => '/analytics/be1-reports',
	);

	return $report_pages;
}
add_filter( 'woocommerce_analytics_report_menu_items', 'add_report_add_report_menu_item' );
