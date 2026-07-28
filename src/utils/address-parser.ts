/**
 * 从粘贴文本智能解析收货地址（前端正则）
 * 覆盖标准电商粘贴格式：姓名 手机 省市区 详细地址（顺序不限）
 */

export interface ParsedAddress {
  receiverName?: string;
  receiverPhone?: string;
  province?: string;
  city?: string;
  district?: string;
  detail?: string;
}

const MUNICIPALITIES = ['北京市', '上海市', '天津市', '重庆市'];
const AUTONOMOUS = ['广西壮族自治区', '内蒙古自治区', '宁夏回族自治区', '西藏自治区', '新疆维吾尔自治区'];

export function parseAddress(rawText: string): ParsedAddress {
  const result: ParsedAddress = {};
  let text = rawText.replace(/[,，、\n\r\t]+/g, ' ').trim();
  if (!text) return result;

  // 1. 提取手机号
  const phoneMatch = text.match(/1[3-9]\d{9}/);
  if (phoneMatch) {
    result.receiverPhone = phoneMatch[0];
    text = text.replace(phoneMatch[0], ' ');
  }

  // 2. 提取直辖市（作为省 + 市）
  for (const muni of MUNICIPALITIES) {
    if (text.includes(muni)) {
      result.province = muni;
      result.city = muni;
      text = text.replace(muni, ' ');
      break;
    }
  }

  // 3. 提取自治区
  if (!result.province) {
    for (const auto of AUTONOMOUS) {
      if (text.includes(auto)) {
        result.province = auto;
        text = text.replace(auto, ' ');
        break;
      }
    }
  }

  // 4. 一般省
  if (!result.province) {
    const provMatch = text.match(/([一-龥]{2,7}省)/);
    if (provMatch) {
      result.province = provMatch[1];
      text = text.replace(provMatch[1], ' ');
    }
  }

  // 5. 市（未匹配到直辖市时）
  if (!result.city) {
    const cityMatch = text.match(/([一-龥]{2,10}市)/);
    if (cityMatch) {
      result.city = cityMatch[1];
      text = text.replace(cityMatch[1], ' ');
    }
  }

  // 6. 区/县/旗
  const distMatch = text.match(/([一-龥]{2,10}(区|县|旗))/);
  if (distMatch) {
    result.district = distMatch[1];
    text = text.replace(distMatch[1], ' ');
  }

  // 7. 剩余文本按空格切分，找姓名 + 详细地址
  const parts = text.split(/\s+/).map(s => s.trim()).filter(Boolean);

  // 姓名：2-4 个纯中文，无数字标点，不含地名后缀
  const nameIdx = parts.findIndex(s =>
    /^[一-龥]{2,4}$/.test(s) &&
    !/(路|街|道|号|巷|弄|镇|乡|村|楼|栋|单元|室|栋|层)$/.test(s)
  );
  if (nameIdx !== -1) {
    result.receiverName = parts[nameIdx];
    parts.splice(nameIdx, 1);
  }

  // 详细地址：剩下的全部
  if (parts.length) {
    result.detail = parts.join('');
  }

  return result;
}
