import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
        <div className="text-6xl font-bold text-gray-300">404</div>
        <h2 className="text-xl font-semibold text-gray-800">页面未找到</h2>
        <p className="text-sm text-gray-500">
          你访问的页面不存在或已被移动。
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
