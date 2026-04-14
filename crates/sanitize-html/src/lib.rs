use ammonia::Builder;
use napi_derive::napi;
use std::collections::{HashMap, HashSet};

#[napi(object)]
pub struct SanitizeOptions {
    pub allowed_tags: Option<Vec<String>>,
    pub allowed_attributes: Option<HashMap<String, Vec<String>>>,
    pub allowed_classes: Option<HashMap<String, Vec<String>>>,
    pub strip_comments: Option<bool>,
    pub link_rel: Option<String>,
}

#[napi]
pub fn sanitize(html: String, options: Option<SanitizeOptions>) -> String {
    let mut builder = Builder::default();

    if let Some(opts) = &options {
        if let Some(tags) = &opts.allowed_tags {
            let tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
            builder.tags(tag_set);
        }
        if let Some(attrs) = &opts.allowed_attributes {
            let mut attr_map: HashMap<&str, HashSet<&str>> = HashMap::new();
            for (tag, attr_list) in attrs {
                let attr_set: HashSet<&str> = attr_list.iter().map(|s| s.as_str()).collect();
                attr_map.insert(tag.as_str(), attr_set);
            }
            builder.tag_attributes(attr_map);
        }
        if let Some(classes) = &opts.allowed_classes {
            let mut class_map: HashMap<&str, HashMap<&str, HashSet<&str>>> = HashMap::new();
            for (tag, class_list) in classes {
                let class_set: HashSet<&str> = class_list.iter().map(|s| s.as_str()).collect();
                let mut inner = HashMap::new();
                inner.insert("class", class_set);
                class_map.insert(tag.as_str(), inner);
            }
            builder.tag_attribute_values(class_map);
        }
        if let Some(strip) = opts.strip_comments {
            builder.strip_comments(strip);
        }
        if let Some(ref rel) = opts.link_rel {
            builder.link_rel(Some(rel));
        }
    }

    builder.clean(&html).to_string()
}

#[napi(js_name = "isClean")]
pub fn is_clean(html: String, options: Option<SanitizeOptions>) -> bool {
    sanitize(html.clone(), options) == html
}
