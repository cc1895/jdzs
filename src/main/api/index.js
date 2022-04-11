/**
 * 京东相关接口
 */
import request from 'request-promise'
import URLS from './url'
import { handleResponse } from './utils'
import log from 'electron-log'

const UserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
const ContentType = 'application/x-www-form-urlencoded'

/**
 * 查询登录状态及是否为京东plus会员
 * @param Cookie
 * @returns {Promise<{isLogin: boolean}|{isLogin: boolean, isPlusMember: boolean}>}
 */
function cookieCheck(Cookie) {
  return request({
    uri: URLS.CHECK_ACCOUNT,
    headers: {
      Cookie,
      'User-Agent': UserAgent
    },
    json: true,
    resolveWithFullResponse: true
  }).then((resp) => {
    const body = resp.body
    log.info(`账号${body === true || body === false ? '有效' : '过期'}`)
    return {
      isLogin: !!(body === true || body === false),
      isPlusMember: body === true
    }
  })
}

/**
 * 获取下单信息
 * @param Cookie
 * @returns {Promise<any>}
 */
function getBuyInfo(Cookie) {
  return request({
    uri: URLS.GET_ORDER,
    headers: {
      Cookie,
      'User-Agent': UserAgent
    }
  }).then((resp) => {
    const parser = new DOMParser()
    const dom = parser.parseFromString(resp, 'text/html')
    const area = dom.querySelector('#hideAreaIds')
    if (!area) return false
    log.info('获取下单信息')
    const id = area.getAttribute('value')
    return id.replace(/-/g, '_')
  })
}

/**
 * 获取库存信息
 * @param sku
 * @param area
 * @returns {Promise<any>}
 */
function getStocks(sku, area) {
  return request(`${URLS.CHECK_STOCKS}?type=getstocks&skuIds=${sku}&area=${area}&_=${+new Date()}`).then((resp) => {
    let result = JSON.parse(resp)
    if (resp && result[sku]) {
      const skuState = result[sku].skuState // 商品是否上架
      const StockState = result[sku].StockState // 商品库存状态：33 -- 现货  0,34 -- 无货  36 -- 采购中  40 -- 可配货
      const status = skuState === 1 && [33, 36, 40].includes(StockState)
      log.info(`库存${status ? '有货' : '无货'}`)
      return status
    }
    return false
  })
}

/**
 * 全选购物车中的商品
 * @param Cookie
 * @returns {Promise<any>}
 */
function selectAllCart(Cookie) {
  return request({
    uri: URLS.SELECT_ALL,
    headers: {
      Cookie,
      'User-Agent': UserAgent
    },
    resolveWithFullResponse: true
  }).then((resp) => {
    const result = handleResponse(resp)
    if (result && result.sortedWebCartResult) {
      log.info('全选购物车中的商品')
      return result.sortedWebCartResult.success
    }
    return false
  })
}

/**
 * 清空购物车
 * @param Cookie
 * @returns {Promise<any>}
 */
function clearCart(Cookie) {
  return selectAllCart(Cookie).then((res) => {
    if (res) {
      return request({
        uri: URLS.CLEAR_ALL,
        headers: {
          Cookie,
          'User-Agent': UserAgent
        },
        resolveWithFullResponse: true
      }).then((resp) => {
        const result = handleResponse(resp)
        if (result && result.sortedWebCartResult) {
          log.info('清空购物车')
          return result.sortedWebCartResult.success
        }
        return false
      })
    }
    return false
  })
}

/**
 * 添加商品到购物车
 * @param Cookie
 * @param skuId
 * @param num
 * @returns {Promise<any>}
 */
async function addGoodsToCart(Cookie, skuId, num) {
  return request({
    uri: URLS.ADD_ITEM,
    qs: {
      pid: skuId,
      pcount: num,
      ptype: 1
    },
    headers: {
      Cookie,
      'User-Agent': UserAgent,
      'Content-Type': ContentType
    },
    json: true,
    resolveWithFullResponse: true
  }).then((resp) => {
    const html = handleResponse(resp)
    log.info('添加商品到购物车')
    return html.indexOf('成功') > -1
  })
}

/**
 * 提交订单（当前购物车内所有商品）
 * @param Cookie
 * @param password
 * @param eid
 * @param fp
 * @returns {Promise<any>}
 */
async function orderSubmit(Cookie, password, eid, fp) {
  const params = {
    overseaPurchaseCookies: '',
    vendorRemarks: '[]',
    presaleStockSign: 1,
    'submitOrderParam.sopNotPutInvoice': 'false',
    'submitOrderParam.trackID': 'TestTrackId',
    'submitOrderParam.ignorePriceChange': '0',
    'submitOrderParam.btSupport': '0',
    'submitOrderParam.jxj': '1',
    'submitOrderParam.payPassword': `u3${password}`,
    'submitOrderParam.eid': eid,
    'submitOrderParam.fp': fp,
    'submitOrderParam.isBestCoupon': '1'
  }
  // 请求结算页面
  await request({
    uri: URLS.GET_ORDER,
    headers: {
      Cookie,
      'User-Agent': UserAgent,
      'Content-Type': ContentType
    },
    resolveWithFullResponse: true
    // eslint-disable-next-line no-unused-vars
  }).then((resp) => {
    log.info('请求结算页面')
  })
  // 提交订单
  return request({
    method: 'POST',
    uri: URLS.SUBMIT_ORDER,
    form: params,
    headers: {
      Cookie,
      'User-Agent': UserAgent,
      Host: 'trade.jd.com',
      Referer: 'http://trade.jd.com/shopping/order/getOrderInfo.action'
    },
    resolveWithFullResponse: true
  }).then((resp) => {
    log.info('提交订单')
    log.info(handleResponse(resp))
    return handleResponse(resp)
  })
}

/**
 * 请求商品详情页
 * @param skuId
 * @returns {Promise<any>}
 */
function getItemInfo(skuId) {
  return request({
    uri: `https://item.jd.com/${skuId}.html`,
    headers: {
      'User-Agent': UserAgent
    },
    resolveWithFullResponse: true
  }).then((resp) => {
    const parser = new DOMParser()
    const html = handleResponse(resp)
    if (!html) return false
    log.info('获取成功')
    // 解析返回的HTML代码
    const dom = parser.parseFromString(html, 'text/html')
    const pageConfig = dom.querySelectorAll('script')[0].innerText
    const imageSrc = dom.querySelector('#spec-img').dataset.origin
    const name = pageConfig.match(/name: '(.*)'/)[1]
    const easyBuyUrl = html.match(/easyBuyUrl:"(.*)"/)[1]
    const cat = pageConfig.match(/cat: \[(.*)\]/)[1]
    const venderId = pageConfig.match(/venderId:(\d*)/)[1]
    return {
      name,
      imageSrc,
      cat,
      venderId,
      easyBuyUrl
    }
  })
}

/**
 * 查询京东服务器时间
 * @returns {Promise<any>}
 */
function getServerTime() {
  return request({
    uri: URLS.GET_SERVER_TIME,
    resolveWithFullResponse: true
  }).then((resp) => {
    return handleResponse(resp)
  })
}

/**
 * 查询秒杀列表
 * @returns {Promise<any>}
 */
function pcMiaoShaAreaList(Cookie, gid) {
  return request({
    uri: URLS.GET_MIAOSHA_LIST,
    qs: {
      functionId: 'pcMiaoShaAreaList',
      client: 'pc',
      appid: 'o2_channels',
      clientVersion: '1.0.0',
      callback: 'pcMiaoShaAreaList',
      jsonp: 'pcMiaoShaAreaList',
      body: gid || {},
      _: new Date().getTime()
    },
    headers: {
      Cookie,
      'User-Agent': UserAgent,
      Referer: 'https://miaosha.jd.com/'
    },
    resolveWithFullResponse: true
  }).then((resp) => {
    return handleResponse(resp)
  })
}

export default {
  cookieCheck,
  getBuyInfo,
  selectAllCart,
  clearCart,
  addGoodsToCart,
  orderSubmit,
  getItemInfo,
  getStocks,
  pcMiaoShaAreaList,
  getServerTime
}
