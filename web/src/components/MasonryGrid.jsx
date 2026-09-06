import { Link } from 'react-router-dom';

export default function MasonryGrid({ items }) {
  return (
    <div className="masonry">
      {items.map((item) => (
        <Link key={item.id} to={`/item/${item.id}`} className="card">
          <figure>
            <img src={`/uploads/${item.image_path}`} alt={item.description || 'Design reference'} loading="lazy" />
            <figcaption className="caption">
              <p className={item.description ? '' : 'placeholder'}>
                {item.description || 'No description'}
              </p>
              {item.tags.length > 0 && (
                <div className="minitags">
                  {item.tags.slice(0, 3).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                  {item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}
                </div>
              )}
            </figcaption>
          </figure>
        </Link>
      ))}
    </div>
  );
}
